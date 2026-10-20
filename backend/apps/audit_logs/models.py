"""
Append-only audit trail.

Rows are written only through `apps.audit_logs.services.record`; the application never edits or
deletes them (the model refuses both). Business-scoped rows are shown in the business Activity Log;
platform and account (security) rows are visible to platform administrators only.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditScope(models.TextChoices):
    BUSINESS = "business", "Business"
    PLATFORM = "platform", "Platform"
    ACCOUNT = "account", "Account security"


class ActorType(models.TextChoices):
    USER = "user", "User"
    PLATFORM_ADMIN = "platform_admin", "Platform admin"
    SYSTEM = "system", "System"
    PUBLIC = "public", "Public visitor"


class AppendOnlyError(RuntimeError):
    pass


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    scope = models.CharField(max_length=16, choices=AuditScope.choices, default=AuditScope.BUSINESS)
    business = models.ForeignKey(
        "businesses.Business", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    # Snapshot so the trail stays readable if the account is later deleted.
    actor_name = models.CharField(max_length=150, blank=True)
    actor_type = models.CharField(max_length=20, choices=ActorType.choices, default=ActorType.USER)
    action = models.CharField(max_length=64)
    module = models.CharField(max_length=32)
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    target_label = models.CharField(max_length=200, blank=True)
    # {"field": {"from": old, "to": new}} — whitelisted, non-sensitive fields only.
    changes = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    request_id = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["business", "-created_at"], name="audit_biz_time"),
            models.Index(fields=["scope", "-created_at"], name="audit_scope_time"),
            models.Index(fields=["target_type", "target_id"], name="audit_target"),
            models.Index(fields=["actor", "-created_at"], name="audit_actor_time"),
            models.Index(fields=["module", "action"], name="audit_action"),
        ]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.target_label}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError("Audit log entries cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("Audit log entries cannot be deleted.")
