import hashlib
import secrets

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import UUIDModel

phone_validator = RegexValidator(
    r"^\+?[0-9][0-9\s\-()]{6,18}$", "Enter a valid phone number (digits, spaces, dashes, optional leading +)."
)


class BusinessCategory(models.TextChoices):
    RETAIL = "retail", "Retailer"
    WHOLESALE = "wholesale", "Wholesaler"
    MANUFACTURER = "manufacturer", "Manufacturer"
    DISTRIBUTOR = "distributor", "Distributor"
    SELLER = "seller", "Independent seller"
    SERVICES = "services", "Services"
    OTHER = "other", "Other"


class Business(UUIDModel):
    """The tenant. Every business-owned record links back here."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"  # set by platform admins only

    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=80, unique=True)
    owner_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, validators=[phone_validator])
    email = models.EmailField()
    category = models.CharField(max_length=20, choices=BusinessCategory.choices)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=2, default="IN", help_text="ISO 3166-1 alpha-2 code.")
    website = models.URLField(blank=True)
    description = models.TextField(blank=True, max_length=2000)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="created_businesses"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "businesses"

    def __str__(self):
        return self.name


class BusinessMembership(UUIDModel):
    """
    Links a user to a business with exactly one role.

    Pending access is represented by StaffInvitation (the invitee may not have an account yet);
    a membership exists only once the invitation is accepted.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    role = models.ForeignKey("rbac.Role", on_delete=models.PROTECT, related_name="memberships")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["business", "user"], name="businesses_membership_unique"),
        ]
        indexes = [
            models.Index(fields=["user", "status"], name="biz_membership_user_status"),
            models.Index(fields=["business", "status"], name="biz_membership_biz_status"),
        ]

    def __str__(self):
        return f"{self.user} @ {self.business} ({self.role})"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE

    @property
    def is_owner(self) -> bool:
        return self.role.is_owner_role


class StaffInvitation(UUIDModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.ForeignKey("rbac.Role", on_delete=models.CASCADE, related_name="invitations")
    # Only a SHA-256 hash of the token is stored; the raw token is emailed once.
    token_hash = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    expires_at = models.DateTimeField()
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "email"],
                condition=Q(status="pending"),
                name="businesses_invitation_one_pending_per_email",
            ),
        ]

    def __str__(self):
        return f"Invitation {self.email} → {self.business}"

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def generate_token() -> str:
        return secrets.token_urlsafe(32)

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at
