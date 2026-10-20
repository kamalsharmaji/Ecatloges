"""
The only way to write audit entries. Call it inside the same transaction as the change it
describes, so a rolled-back change leaves no entry behind.

Privacy rules (enforced here, not at call sites):
- `changes` should list whitelisted fields; any key that looks sensitive is redacted anyway.
- Free text (messages, notes, descriptions) is never stored — only that it changed.
- Values are truncated; model instances are reduced to their id.
"""
import datetime
import decimal
import logging
import re
import uuid

from django.db import models

from apps.core.logging import request_id_var

from .models import ActorType, AuditLog, AuditScope

logger = logging.getLogger("apps.audit_logs")

REDACTED = "[redacted]"
SENSITIVE_KEY = re.compile(
    r"pass|token|secret|signature|api_?key|authorization|cookie|card|cvv|otp|"
    r"message|notes?$|body|description|phone|whatsapp|email",
    re.IGNORECASE,
)
MAX_VALUE = 200

# Free-text-ish models get a reference instead of a name, so the trail holds no customer data.
_REFERENCE_LABEL = {"enquiry": "Enquiry", "customer": "Customer", "supportticket": "Ticket"}


def _clean_value(value):
    if isinstance(value, models.Model):
        return str(value.pk)
    if isinstance(value, (uuid.UUID, decimal.Decimal, datetime.date, datetime.datetime)):
        return str(value)
    if isinstance(value, (list, tuple, set)):
        return [_clean_value(v) for v in list(value)[:50]]
    if isinstance(value, dict):
        return redact(value)
    if isinstance(value, str) and len(value) > MAX_VALUE:
        return value[:MAX_VALUE] + "…"
    return value


def redact(data: dict | None) -> dict:
    out = {}
    for key, value in (data or {}).items():
        out[str(key)] = REDACTED if SENSITIVE_KEY.search(str(key)) else _clean_value(value)
    return out


def snapshot(instance, fields) -> dict:
    """Current values of `fields` (FKs as ids) for a later `diff`."""
    values = {}
    for name in fields:
        field = instance._meta.get_field(name)
        attr = field.attname if field.is_relation and field.many_to_one else name
        values[name] = _clean_value(getattr(instance, attr))
    return values


def diff(before: dict, after: dict) -> dict:
    return {k: {"from": before.get(k), "to": after.get(k)} for k in after if before.get(k) != after.get(k)}


def label_for(instance) -> str:
    model = instance._meta.model_name
    if model in _REFERENCE_LABEL:
        ref = getattr(instance, "reference", None) or str(instance.pk)[:8].upper()
        return f"{_REFERENCE_LABEL[model]} {ref}"
    for attr in ("name", "title", "subject", "code"):
        value = getattr(instance, attr, None)
        if value:
            return str(value)[:MAX_VALUE]
    return str(instance.pk)


def record(
    action: str,
    *,
    business=None,
    actor=None,
    actor_type: str | None = None,
    scope: str | None = None,
    target=None,
    target_type: str = "",
    target_id: str = "",
    target_label: str = "",
    changes: dict | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    if target is not None:
        target_type = target_type or target._meta.model_name
        target_id = target_id or str(target.pk)
        target_label = target_label or label_for(target)
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None
    entry = AuditLog.objects.create(
        scope=scope or (AuditScope.BUSINESS if business is not None else AuditScope.PLATFORM),
        business=business,
        actor=actor,
        actor_name=(actor.full_name or actor.email)[:150] if actor else "",
        actor_type=actor_type or (ActorType.USER if actor else ActorType.SYSTEM),
        action=action,
        module=action.split(".", 1)[0],
        target_type=target_type,
        target_id=target_id,
        target_label=target_label[:200],
        changes={k: {"from": _clean_value(v.get("from")), "to": _clean_value(v.get("to"))}
                 if not SENSITIVE_KEY.search(k) else {"from": REDACTED, "to": REDACTED}
                 for k, v in (changes or {}).items()},
        metadata=redact(metadata),
        request_id=request_id_var.get()[:64] if request_id_var.get() != "-" else "",
    )
    return entry


def record_ctx(ctx, action: str, **kwargs) -> AuditLog:
    """Business action performed by the member in `ctx` (a BusinessContext)."""
    return record(action, business=ctx.business, actor=ctx.membership.user, **kwargs)


def record_platform(actor, action: str, **kwargs) -> AuditLog:
    """Action taken by a platform administrator (visible in the platform audit log only)."""
    kwargs.setdefault("scope", AuditScope.PLATFORM)
    return record(action, actor=actor, actor_type=ActorType.PLATFORM_ADMIN, **kwargs)
