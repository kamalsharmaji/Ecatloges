import uuid

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from .managers import UserManager


class PlatformRole(models.TextChoices):
    """
    Platform-level role. Empty for ordinary users (business owners and staff), whose
    access is governed by business memberships and RBAC roles instead.
    """

    NONE = "", "None"
    SUPER_ADMIN = "super_admin", "Platform Super Admin"
    SUPPORT_ADMIN = "support_admin", "Platform Support Admin"


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Stored lower-cased by save(); the functional constraint below also guards bulk writes.
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)

    platform_role = models.CharField(
        max_length=20, choices=PlatformRole.choices, default=PlatformRole.NONE, blank=True
    )
    is_active = models.BooleanField(default=True)
    # Grants access to the Django admin site only; not used for API authorization.
    is_staff = models.BooleanField(default=False)

    is_email_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)

    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["-date_joined"]
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique"),
        ]
        indexes = [
            models.Index(fields=["platform_role"], name="accounts_user_prole_idx"),
        ]

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_platform_admin(self) -> bool:
        return self.is_active and self.platform_role in (
            PlatformRole.SUPER_ADMIN,
            PlatformRole.SUPPORT_ADMIN,
        )

    @property
    def is_platform_super_admin(self) -> bool:
        return self.is_active and self.platform_role == PlatformRole.SUPER_ADMIN

    def mark_email_verified(self):
        self.is_email_verified = True
        self.email_verified_at = timezone.now()
        self.save(update_fields=["is_email_verified", "email_verified_at", "updated_at"])
