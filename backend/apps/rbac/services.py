from django.db import IntegrityError, transaction
from rest_framework import exceptions

from apps.core.exceptions import BusinessRuleViolation

from .models import Permission, Role, RolePermission


def _validated_permissions(ctx, codes) -> list[Permission]:
    codes = set(codes)
    permissions = list(Permission.objects.filter(code__in=codes, assignable=True))
    unknown = codes - {p.code for p in permissions}
    if unknown:
        raise exceptions.ValidationError({"permissions": [f"Unknown or reserved permission: {c}" for c in sorted(unknown)]})
    # No privilege escalation: a custom role can only contain permissions the editor holds.
    if not codes <= ctx.permissions:
        raise exceptions.PermissionDenied("You cannot grant permissions that you do not hold yourself.")
    return permissions


def _assert_editable(role: Role) -> None:
    if role.is_system:
        raise BusinessRuleViolation("System roles cannot be changed.", code="system_role")


def _set_permissions(role: Role, permissions: list[Permission]) -> None:
    RolePermission.objects.filter(role=role).delete()
    RolePermission.objects.bulk_create([RolePermission(role=role, permission=p) for p in permissions])


@transaction.atomic
def create_role(ctx, *, name: str, description: str = "", permissions: list[str]) -> Role:
    perms = _validated_permissions(ctx, permissions)
    try:
        with transaction.atomic():
            role = Role.objects.create(business=ctx.business, name=name.strip(), description=description)
    except IntegrityError:
        raise exceptions.ValidationError({"name": ["A role with this name already exists."]}) from None
    _set_permissions(role, perms)
    return role


@transaction.atomic
def update_role(ctx, role: Role, *, name=None, description=None, permissions=None) -> Role:
    _assert_editable(role)
    # Editing a role changes what its holders can do, so the editor must hold everything
    # the role grants today as well as everything it will grant afterwards.
    if not role.permission_codes() <= ctx.permissions:
        raise exceptions.PermissionDenied("You cannot edit a role that grants permissions you do not hold.")
    if ctx.membership.role_id == role.pk:
        raise exceptions.PermissionDenied("You cannot edit the role assigned to you.")
    if name is not None:
        role.name = name.strip()
    if description is not None:
        role.description = description
    try:
        with transaction.atomic():
            role.save()
    except IntegrityError:
        raise exceptions.ValidationError({"name": ["A role with this name already exists."]}) from None
    if permissions is not None:
        _set_permissions(role, _validated_permissions(ctx, permissions))
    return role


@transaction.atomic
def delete_role(ctx, role: Role) -> None:
    _assert_editable(role)
    if role.memberships.exists():
        raise BusinessRuleViolation("Reassign members using this role before deleting it.", code="role_in_use")
    if not role.permission_codes() <= ctx.permissions:
        raise exceptions.PermissionDenied("You cannot delete a role that grants permissions you do not hold.")
    role.delete()
