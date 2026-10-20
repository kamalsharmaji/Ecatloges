from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import UUIDModel


class NotificationCategory(models.TextChoices):
    ENQUIRY = "enquiry", "Enquiries"
    CATALOGUE = "catalogue", "Catalogues"
    PRODUCT = "product", "Products"
    PAYMENT = "payment", "Payments"
    SUBSCRIPTION = "subscription", "Subscription"
    TEAM = "team", "Team activity"
    SUPPORT = "support", "Support"
    ANNOUNCEMENT = "announcement", "Announcements"
    SYSTEM = "system", "System"


class NotificationLevel(models.TextChoices):
    INFO = "info", "Info"
    SUCCESS = "success", "Success"
    WARNING = "warning", "Warning"
    ERROR = "error", "Error"


class Notification(UUIDModel):
    """
    One in-app message for one user. `business` is the tenant the event happened in (null for
    personal or platform notifications). Messages are short and never carry contact details or
    free text from customers — the link leads to the RBAC-protected record instead.
    """

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    business = models.ForeignKey(
        "businesses.Business", null=True, blank=True, on_delete=models.CASCADE, related_name="notifications"
    )
    category = models.CharField(max_length=20, choices=NotificationCategory.choices)
    event = models.CharField(max_length=64)
    level = models.CharField(max_length=10, choices=NotificationLevel.choices, default=NotificationLevel.INFO)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=255, blank=True, help_text="In-app path, e.g. /app/enquiries?enquiry=<id>")
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    # Same key twice for the same recipient is ignored: webhook retries and double submits are safe.
    dedup_key = models.CharField(max_length=150, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "dedup_key"], condition=~Q(dedup_key=""), name="notification_dedup_unique"
            ),
        ]
        indexes = [
            models.Index(fields=["recipient", "-created_at"], name="notif_recipient_time"),
            models.Index(fields=["recipient", "read_at"], name="notif_recipient_unread"),
            models.Index(fields=["recipient", "business", "-created_at"], name="notif_recipient_biz"),
        ]

    def __str__(self):
        return f"{self.recipient_id}: {self.title}"

    @property
    def is_read(self) -> bool:
        return self.read_at is not None


class NotificationPreference(models.Model):
    """
    A user's choice for one preference group (see notifications/preferences.py). No row = the
    default for that group, so existing and new users need no data migration.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences")
    key = models.CharField(max_length=20)
    in_app = models.BooleanField(default=True)
    email = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="notification_pref_unique")]

    def __str__(self):
        return f"{self.user_id}:{self.key}"


class EmailTemplate(models.Model):
    """Admin-edited override of a built-in email (notifications/email_templates.py REGISTRY)."""

    key = models.CharField(max_length=50, unique=True)
    subject = models.CharField(max_length=200)
    body = models.TextField(max_length=10_000)
    # Inactive = keep the draft but send the built-in default.
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.key


class AnnouncementAudience(models.TextChoices):
    ALL_BUSINESSES = "all_businesses", "All members of all businesses"
    BUSINESS_OWNERS = "business_owners", "Business owners only"
    SELECTED_BUSINESSES = "selected_businesses", "Members of selected businesses"
    PLATFORM_STAFF = "platform_staff", "Platform staff (Super & Support Admins)"


class AnnouncementStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SCHEDULED = "scheduled", "Scheduled"
    PUBLISHED = "published", "Published"
    UNPUBLISHED = "unpublished", "Unpublished"
    ARCHIVED = "archived", "Archived"


class Announcement(UUIDModel):
    title = models.CharField(max_length=150)
    body = models.TextField(max_length=4000)
    level = models.CharField(max_length=10, choices=NotificationLevel.choices, default=NotificationLevel.INFO)
    audience = models.CharField(max_length=24, choices=AnnouncementAudience.choices, default=AnnouncementAudience.ALL_BUSINESSES)
    businesses = models.ManyToManyField("businesses.Business", blank=True, related_name="+")
    status = models.CharField(max_length=12, choices=AnnouncementStatus.choices, default=AnnouncementStatus.DRAFT)
    send_email = models.BooleanField(default=False, help_text="Also email recipients who opted in to announcement emails.")
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    # Set once when notifications go out — re-publishing or a retried job never sends twice.
    delivered_at = models.DateTimeField(null=True, blank=True)
    recipient_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "starts_at"], name="announcement_status_start")]

    def __str__(self):
        return self.title
