from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import UUIDModel

TICKET_NUMBER_START = 1001


class TicketStatus(models.TextChoices):
    OPEN = "open", "Open"
    IN_PROGRESS = "in_progress", "In progress"
    WAITING_FOR_USER = "waiting_for_user", "Waiting for user"
    RESOLVED = "resolved", "Resolved"
    CLOSED = "closed", "Closed"


class TicketCategory(models.TextChoices):
    TECHNICAL = "technical", "Technical"
    BILLING = "billing", "Billing & payments"
    SUBSCRIPTION = "subscription", "Subscription"
    CATALOGUE = "catalogue", "Catalogues & products"
    QR_CODE = "qr_code", "QR codes"
    DOMAIN = "domain", "Domain"
    ACCOUNT = "account", "Account"
    FEATURE_REQUEST = "feature_request", "Feature request"
    OTHER = "other", "Other"


class TicketPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class SupportTicket(UUIDModel):
    number = models.PositiveIntegerField(unique=True, editable=False)
    business = models.ForeignKey(
        "businesses.Business", null=True, blank=True, on_delete=models.CASCADE, related_name="support_tickets"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="support_tickets"
    )
    subject = models.CharField(max_length=150)
    category = models.CharField(max_length=20, choices=TicketCategory.choices, default=TicketCategory.TECHNICAL)
    priority = models.CharField(max_length=10, choices=TicketPriority.choices, default=TicketPriority.MEDIUM)
    status = models.CharField(max_length=20, choices=TicketStatus.choices, default=TicketStatus.OPEN)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_tickets"
    )
    # Client-generated key: a retried "create" returns the first ticket instead of a duplicate.
    client_key = models.UUIDField(null=True, blank=True)
    last_activity_at = models.DateTimeField()
    status_changed_at = models.DateTimeField(null=True, blank=True)
    first_response_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_activity_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["created_by", "client_key"], condition=Q(client_key__isnull=False), name="ticket_client_key_unique"
            ),
        ]
        indexes = [
            models.Index(fields=["business", "-last_activity_at"], name="ticket_biz_activity"),
            models.Index(fields=["created_by", "-last_activity_at"], name="ticket_creator_activity"),
            models.Index(fields=["status", "-last_activity_at"], name="ticket_status_activity"),
            models.Index(fields=["assigned_to", "status"], name="ticket_assignee_status"),
        ]

    def __str__(self):
        return f"{self.reference} {self.subject}"

    @property
    def reference(self) -> str:
        return f"TKT-{self.number}"


class MessageKind(models.TextChoices):
    MESSAGE = "message", "Message"
    EVENT = "event", "Event"  # status change, assignment… shown in the timeline


class TicketMessage(UUIDModel):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    author_name = models.CharField(max_length=150, blank=True)
    kind = models.CharField(max_length=10, choices=MessageKind.choices, default=MessageKind.MESSAGE)
    # Written by platform support staff (shown as "Support team" to the business).
    is_staff = models.BooleanField(default=False)
    # Internal notes and internal events are never returned by business-facing endpoints.
    is_internal = models.BooleanField(default=False)
    body = models.TextField(max_length=5000)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["ticket", "created_at"], name="ticketmsg_ticket_time")]

    def __str__(self):
        return f"{self.ticket_id} {self.kind}"
