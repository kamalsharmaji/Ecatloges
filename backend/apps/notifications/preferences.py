"""
Notification preferences.

Each group below maps one or more notification categories to two channels. A group/channel is:
- `None`  → not available (no such message exists on that channel today),
- locked  → mandatory, always delivered (security, transactional and billing messages),
- a bool  → the default when the user hasn't chosen (no database row needed).

Preferences are per user (not per business) and only ever filter optional messages.
"""
from dataclasses import dataclass

from django.db import transaction
from rest_framework import exceptions

from .models import NotificationPreference


@dataclass(frozen=True)
class Channel:
    default: bool
    locked: bool = False


@dataclass(frozen=True)
class PreferenceGroup:
    key: str
    label: str
    description: str
    categories: tuple[str, ...]
    in_app: Channel | None
    email: Channel | None
    note: str = ""


GROUPS: list[PreferenceGroup] = [
    PreferenceGroup(
        "enquiry", "New enquiries", "When a customer sends an enquiry from one of your catalogues.",
        ("enquiry",), Channel(True), None,
        note="Enquiry emails go to the business email address — switch them in Settings → Catalogue (owners/admins).",
    ),
    PreferenceGroup(
        "catalogue", "Catalogue activity", "When a teammate publishes a catalogue.",
        ("catalogue", "product"), Channel(True), None,
    ),
    PreferenceGroup(
        "team", "Team & invitations", "New team members, role changes and invitations.",
        ("team",), Channel(True), None,
        note="Invitation emails are always sent — they are how people join.",
    ),
    PreferenceGroup(
        "billing", "Billing & subscription", "Payments, invoices, renewals and plan expiry.",
        ("payment", "subscription"), Channel(True, locked=True), None,
        note="Required: billing notices can't be turned off.",
    ),
    PreferenceGroup(
        "support", "Support tickets", "Replies and status changes on your support tickets.",
        ("support",), Channel(True), Channel(True),
    ),
    PreferenceGroup(
        "announcement", "Product announcements", "News and service notices from the myEcatalogues team.",
        ("announcement", "system"), Channel(True), Channel(False),
    ),
    PreferenceGroup(
        "security", "Account security", "Email verification and password reset emails.",
        (), None, Channel(True, locked=True),
        note="Required: security emails are always sent.",
    ),
]
BY_KEY = {g.key: g for g in GROUPS}
CATEGORY_GROUP = {category: g for g in GROUPS for category in g.categories}


def _stored(user_ids, key: str) -> dict:
    return {
        p.user_id: p
        for p in NotificationPreference.objects.filter(user_id__in=list(user_ids), key=key)
    }


def in_app_allowed(user_ids, category: str) -> set:
    """Subset of `user_ids` that should get an in-app notification of `category`."""
    user_ids = set(user_ids)
    group = CATEGORY_GROUP.get(category)
    if group is None or group.in_app is None or group.in_app.locked:
        return user_ids
    stored = _stored(user_ids, group.key)
    return {uid for uid in user_ids if (stored[uid].in_app if uid in stored else group.in_app.default)}


def email_enabled(user, key: str) -> bool:
    group = BY_KEY[key]
    if group.email is None:
        return False
    if group.email.locked:
        return True
    stored = NotificationPreference.objects.filter(user=user, key=key).first()
    return stored.email if stored else group.email.default


@transaction.atomic
def update_preferences(user, changes: list[dict]) -> None:
    """Apply [{key, in_app?, email?}]. Mandatory or unavailable channels can't be switched off."""
    errors = []
    for change in changes:
        group = BY_KEY.get(change["key"])
        if group is None:
            errors.append(f"Unknown preference: {change['key']}.")
            continue
        for channel_name in ("in_app", "email"):
            if channel_name not in change:
                continue
            channel = getattr(group, channel_name)
            if channel is None:
                errors.append(f"{group.label}: there are no {channel_name.replace('_', '-')} messages to configure.")
            elif channel.locked and change[channel_name] is not True:
                errors.append(f"{group.label}: these messages are required and can't be turned off.")
    if errors:
        raise exceptions.ValidationError({"preferences": errors})

    audit_changes = {}
    for change in changes:
        group = BY_KEY[change["key"]]
        pref, _ = NotificationPreference.objects.select_for_update().get_or_create(
            user=user, key=group.key,
            defaults={"in_app": group.in_app.default if group.in_app else True,
                      "email": group.email.default if group.email else False},
        )
        for channel_name in ("in_app", "email"):
            if channel_name in change and getattr(pref, channel_name) != change[channel_name]:
                # "e-mail" spelling keeps the audit redactor (which hides *email* values) from masking a plain on/off.
                label = f"{group.label} ({'in-app' if channel_name == 'in_app' else 'e-mail'})"
                audit_changes[label] = {"from": getattr(pref, channel_name), "to": change[channel_name]}
                setattr(pref, channel_name, change[channel_name])
        pref.save()
    if audit_changes:
        from apps.audit_logs import services as audit
        from apps.audit_logs.models import AuditScope

        audit.record("notification.preferences_updated", actor=user, scope=AuditScope.ACCOUNT, target=user,
                     target_label=user.full_name or user.email, changes=audit_changes)


def preferences_for(user) -> list[dict]:
    stored = {p.key: p for p in NotificationPreference.objects.filter(user=user)}
    rows = []
    for g in GROUPS:
        p = stored.get(g.key)

        def value(channel, attr):
            if channel is None:
                return None
            if channel.locked:
                return True
            return getattr(p, attr) if p else channel.default

        rows.append({
            "key": g.key,
            "label": g.label,
            "description": g.description,
            "note": g.note,
            "in_app": value(g.in_app, "in_app"),
            "email": value(g.email, "email"),
            "in_app_available": g.in_app is not None,
            "email_available": g.email is not None,
            "in_app_locked": bool(g.in_app and g.in_app.locked),
            "email_locked": bool(g.email and g.email.locked),
        })
    return rows
