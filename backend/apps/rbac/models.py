from django.db import models
from django.db.models import Q

from apps.core.models import UUIDModel


class Permission(models.Model):
    """A granular business-level permission. Rows are synced from rbac.registry."""

    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    module = models.CharField(max_length=32, db_index=True)
    assignable = models.BooleanField(
        default=True, help_text="False for owner-reserved permissions that custom roles cannot hold."
    )

    class Meta:
        ordering = ["module", "code"]

    def __str__(self):
        return self.code


class Role(UUIDModel):
    """
    A named set of permissions.

    System roles have business=NULL and a fixed `key`; they are shared by all businesses and
    cannot be edited through the API. Custom roles belong to exactly one business.
    """

    business = models.ForeignKey(
        "businesses.Business", null=True, blank=True, on_delete=models.CASCADE, related_name="custom_roles"
    )
    key = models.SlugField(max_length=40, blank=True, help_text="Stable identifier for system roles.")
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=255, blank=True)
    is_system = models.BooleanField(default=False)
    permissions = models.ManyToManyField(Permission, through="RolePermission", related_name="roles")

    class Meta:
        ordering = ["-is_system", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["key"], condition=Q(business__isnull=True), name="rbac_role_system_key_unique"
            ),
            models.UniqueConstraint(
                fields=["business", "name"], condition=Q(business__isnull=False), name="rbac_role_business_name_unique"
            ),
            models.CheckConstraint(
                condition=Q(is_system=True, business__isnull=True) | Q(is_system=False, business__isnull=False),
                name="rbac_role_system_xor_business",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def is_owner_role(self) -> bool:
        from .registry import OWNER

        return self.is_system and self.key == OWNER

    def permission_codes(self) -> frozenset[str]:
        # Uses the prefetch cache when available (see BusinessContext).
        return frozenset(p.code for p in self.permissions.all())


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="rbac_rolepermission_unique"),
        ]
