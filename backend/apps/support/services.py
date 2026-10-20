"""
Support ticket workflow.

Status policy (also in docs/ARCHITECTURE.md):

    open ─────────► in_progress ◄────► waiting_for_user
      │  ▲               │                    │
      ▼  │ reopen        ▼                    ▼
    resolved ◄─────────────────────────────────┘ ──► closed

- Support staff may make any transition listed in TRANSITIONS.
- The requester (business side) may close a ticket at any time and reopen a resolved one.
- A requester reply on `waiting_for_user` or `resolved` moves the ticket back to `open`.
- Nobody can reply to a closed ticket; staff can reopen it first.

Email and in-app notifications are sent after commit; a failed email is logged and never changes
ticket state.
"""
import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import exceptions

from apps.audit_logs import services as audit
from apps.audit_logs.models import AuditScope
from apps.notifications.emails import send_email
from apps.notifications.preferences import email_enabled
from apps.core.exceptions import BusinessRuleViolation
from apps.notifications.models import NotificationLevel
from apps.notifications.services import notify, platform_support_staff

from .models import TICKET_NUMBER_START, MessageKind, SupportTicket, TicketMessage, TicketStatus

logger = logging.getLogger("apps.support")
S = TicketStatus

TRANSITIONS: dict[str, set[str]] = {
    S.OPEN: {S.IN_PROGRESS, S.WAITING_FOR_USER, S.RESOLVED, S.CLOSED},
    S.IN_PROGRESS: {S.OPEN, S.WAITING_FOR_USER, S.RESOLVED, S.CLOSED},
    S.WAITING_FOR_USER: {S.OPEN, S.IN_PROGRESS, S.RESOLVED, S.CLOSED},
    S.RESOLVED: {S.OPEN, S.CLOSED},
    S.CLOSED: {S.OPEN},
}
REQUESTER_TRANSITIONS: dict[str, set[str]] = {
    S.OPEN: {S.CLOSED},
    S.IN_PROGRESS: {S.CLOSED},
    S.WAITING_FOR_USER: {S.CLOSED},
    S.RESOLVED: {S.OPEN, S.CLOSED},
    S.CLOSED: set(),
}


def _name(user) -> str:
    return (user.full_name or user.email)[:150] if user else ""


def _panel_link(ticket) -> str:
    return f"/app/support?ticket={ticket.id}"


def _admin_link(ticket) -> str:
    return f"/admin/support?ticket={ticket.id}"


def _event(ticket, actor, text: str, *, is_staff: bool, internal: bool = False) -> TicketMessage:
    return TicketMessage.objects.create(
        ticket=ticket, author=actor, author_name=_name(actor), kind=MessageKind.EVENT,
        is_staff=is_staff, is_internal=internal, body=text,
    )


def _audit(ticket, actor, action, *, staff: bool, **kwargs):
    if staff:
        audit.record_platform(actor, action, business=ticket.business, target=ticket,
                              scope=AuditScope.BUSINESS if ticket.business_id else AuditScope.PLATFORM, **kwargs)
    else:
        audit.record(action, business=ticket.business, actor=actor, target=ticket, **kwargs)


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------
def create_ticket(*, user, business, subject, category, priority, description, client_key=None) -> tuple[SupportTicket, bool]:
    """Returns (ticket, created). A repeated client_key returns the original ticket."""
    if client_key:
        existing = SupportTicket.objects.filter(created_by=user, client_key=client_key).first()
        if existing:
            return existing, False
    for attempt in range(5):
        try:
            with transaction.atomic():
                ticket = _create(user, business, subject, category, priority, description, client_key)
            return ticket, True
        except IntegrityError:
            if client_key and (existing := SupportTicket.objects.filter(created_by=user, client_key=client_key).first()):
                return existing, False
            if attempt == 4:  # pragma: no cover - five concurrent number collisions
                raise
    raise AssertionError("unreachable")  # pragma: no cover


def _create(user, business, subject, category, priority, description, client_key) -> SupportTicket:
    last = SupportTicket.objects.aggregate(n=Max("number"))["n"]
    now = timezone.now()
    ticket = SupportTicket.objects.create(
        number=(last or TICKET_NUMBER_START - 1) + 1,
        business=business,
        created_by=user,
        subject=subject,
        category=category,
        priority=priority,
        client_key=client_key,
        last_activity_at=now,
        status_changed_at=now,
    )
    TicketMessage.objects.create(ticket=ticket, author=user, author_name=_name(user), body=description)
    _audit(ticket, user, "support.ticket_created", staff=False,
           metadata={"category": category, "priority": priority})
    notify(
        platform_support_staff(exclude=user),
        event="support.ticket_created",
        category="support",
        title=f"New ticket {ticket.reference}",
        body=f"{subject} — {business.name if business else _name(user)}",
        link=_admin_link(ticket),
        target=ticket,
        dedup_key=f"ticket:{ticket.id}:created",
        level=NotificationLevel.WARNING if priority in ("high", "urgent") else NotificationLevel.INFO,
    )
    logger.info("Support ticket created", extra={"ticket_id": str(ticket.id)})
    return ticket


# ---------------------------------------------------------------------------
# Replies
# ---------------------------------------------------------------------------
@transaction.atomic
def requester_reply(ticket: SupportTicket, *, user, body: str) -> TicketMessage:
    ticket = SupportTicket.objects.select_for_update().get(pk=ticket.pk)
    if ticket.status == S.CLOSED:
        raise BusinessRuleViolation("This ticket is closed. Create a new ticket if you still need help.", code="ticket_closed")
    message = TicketMessage.objects.create(ticket=ticket, author=user, author_name=_name(user), body=body)
    now = timezone.now()
    ticket.last_activity_at = now
    if ticket.status in (S.WAITING_FOR_USER, S.RESOLVED):
        _set_status(ticket, S.OPEN, actor=user, staff=False, automatic=True)
    ticket.save()
    _audit(ticket, user, "support.replied", staff=False)
    recipients = [ticket.assigned_to] if ticket.assigned_to_id else platform_support_staff(exclude=user)
    notify(
        recipients,
        event="support.user_replied",
        category="support",
        title=f"New reply on {ticket.reference}",
        body=ticket.subject,
        link=_admin_link(ticket),
        target=ticket,
        dedup_key=f"ticketmsg:{message.id}",
    )
    return message


@transaction.atomic
def staff_reply(ticket: SupportTicket, *, user, body: str, internal: bool = False, status: str | None = None) -> TicketMessage:
    ticket = SupportTicket.objects.select_for_update().get(pk=ticket.pk)
    if ticket.status == S.CLOSED and not internal:
        raise BusinessRuleViolation("Reopen the ticket before replying.", code="ticket_closed")
    message = TicketMessage.objects.create(
        ticket=ticket, author=user, author_name=_name(user), is_staff=True, is_internal=internal, body=body
    )
    now = timezone.now()
    if not internal:
        ticket.last_activity_at = now
        ticket.first_response_at = ticket.first_response_at or now
    if status and status != ticket.status:
        _set_status(ticket, status, actor=user, staff=True, automatic=True)
    ticket.save()
    _audit(ticket, user, "support.internal_note" if internal else "support.replied", staff=True)
    if not internal:
        creator = ticket.created_by
        notify(
            [creator],
            business=ticket.business,
            event="support.staff_replied",
            category="support",
            title=f"Support replied to {ticket.reference}",
            body=ticket.subject,
            link=_panel_link(ticket),
            target=ticket,
            dedup_key=f"ticketmsg:{message.id}",
        )
        if creator and creator.email:
            transaction.on_commit(lambda: _email_requester(ticket, "support.reply"))
    return message


# ---------------------------------------------------------------------------
# Status, assignment, priority
# ---------------------------------------------------------------------------
def _set_status(ticket, target: str, *, actor, staff: bool, automatic: bool = False) -> None:
    """`automatic` = side effect of a reply (allowed by policy, announced by the reply itself)."""
    allowed = TRANSITIONS if staff or automatic else REQUESTER_TRANSITIONS
    if target not in allowed.get(ticket.status, set()):
        raise BusinessRuleViolation(
            f"A ticket that is {ticket.get_status_display().lower()} cannot be moved to "
            f"{S(target).label.lower()}.", code="invalid_status_transition",
        )
    before = ticket.status
    now = timezone.now()
    ticket.status = target
    ticket.status_changed_at = now
    if target == S.RESOLVED:
        ticket.resolved_at = now
    if target == S.CLOSED:
        ticket.closed_at = now
    if target == S.OPEN:
        ticket.resolved_at = None
        ticket.closed_at = None
    _event(ticket, actor, f"Status changed from {S(before).label} to {S(target).label}", is_staff=staff)
    _audit(ticket, actor, "support.status_changed", staff=staff, changes={"status": {"from": before, "to": target}})
    if staff and ticket.created_by_id and not automatic:
        notify(
            [ticket.created_by],
            business=ticket.business,
            event="support.status_changed",
            category="support",
            level=NotificationLevel.SUCCESS if target == S.RESOLVED else NotificationLevel.INFO,
            title=f"{ticket.reference} is now {S(target).label.lower()}",
            body=ticket.subject,
            link=_panel_link(ticket),
            target=ticket,
            dedup_key=f"ticket:{ticket.id}:status:{target}:{now.timestamp()}",
        )
        if target == S.RESOLVED:
            transaction.on_commit(lambda: _email_requester(ticket, "support.resolved"))
    elif not staff and not automatic:
        notify(
            [ticket.assigned_to] if ticket.assigned_to_id else platform_support_staff(exclude=actor),
            event="support.status_changed",
            category="support",
            title=f"{ticket.reference} {('reopened' if target == S.OPEN else 'closed')} by the requester",
            body=ticket.subject,
            link=_admin_link(ticket),
            target=ticket,
            dedup_key=f"ticket:{ticket.id}:status:{target}:{now.timestamp()}",
        )


@transaction.atomic
def change_status(ticket: SupportTicket, *, user, status: str, staff: bool) -> SupportTicket:
    ticket = SupportTicket.objects.select_for_update().get(pk=ticket.pk)
    if status == ticket.status:
        return ticket
    _set_status(ticket, status, actor=user, staff=staff)
    ticket.last_activity_at = timezone.now()
    ticket.save()
    return ticket


@transaction.atomic
def update_ticket(ticket: SupportTicket, *, user, assigned_to=..., priority=None, category=None) -> SupportTicket:
    """Staff-only metadata changes. Assignment changes are internal (the business never sees who)."""
    ticket = SupportTicket.objects.select_for_update().get(pk=ticket.pk)
    changes = {}
    if assigned_to is not ... and assigned_to != ticket.assigned_to:
        if assigned_to is not None and not assigned_to.is_platform_admin:
            raise exceptions.ValidationError({"assigned_to": ["Tickets can only be assigned to support staff."]})
        changes["assigned_to"] = {"from": ticket.assigned_to_id, "to": assigned_to.pk if assigned_to else None}
        ticket.assigned_to = assigned_to
        _event(ticket, user, f"Assigned to {_name(assigned_to)}" if assigned_to else "Unassigned", is_staff=True, internal=True)
        if assigned_to is not None and assigned_to != user:
            notify(
                [assigned_to],
                event="support.assigned",
                category="support",
                title=f"{ticket.reference} was assigned to you",
                body=ticket.subject,
                link=_admin_link(ticket),
                target=ticket,
                dedup_key=f"ticket:{ticket.id}:assigned:{assigned_to.pk}:{timezone.now().timestamp()}",
            )
    for field, value in (("priority", priority), ("category", category)):
        if value and value != getattr(ticket, field):
            changes[field] = {"from": getattr(ticket, field), "to": value}
            setattr(ticket, field, value)
            _event(ticket, user, f"{field.title()} changed to {getattr(ticket, f'get_{field}_display')()}", is_staff=True)
    if changes:
        ticket.save()
        # Assignment is platform-internal; priority/category changes are visible to the business.
        audit.record_platform(user, "support.ticket_updated", target=ticket, changes=changes,
                              business=ticket.business, scope=AuditScope.PLATFORM)
    return ticket


def _email_requester(ticket: SupportTicket, key: str) -> None:
    ticket = SupportTicket.objects.select_related("created_by").get(pk=ticket.pk)
    creator = ticket.created_by
    # Optional email: respects the requester's "Support tickets" email preference (in-app is separate).
    if not creator or not creator.email or not email_enabled(creator, "support"):
        return
    send_email(
        key,
        to=creator.email,
        context={
            "name": creator.full_name or creator.email,
            "ticket_reference": ticket.reference,
            "ticket_subject": ticket.subject,
            "ticket_url": f"{settings.FRONTEND_URL}{_panel_link(ticket)}",
        },
    )
