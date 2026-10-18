import logging

from django.db import transaction

logger = logging.getLogger("apps.rbac")


def sync_rbac(sender=None, using="default", apps=None, **kwargs):
    """Idempotently sync permissions and system roles from the registry after migrate."""
    from .models import Permission, Role, RolePermission
    from .registry import PERMISSIONS, SYSTEM_ROLES

    with transaction.atomic(using=using):
        existing = {p.code: p for p in Permission.objects.using(using).all()}
        for definition in PERMISSIONS:
            module = definition.code.split(".", 1)[0]
            perm = existing.get(definition.code)
            if perm is None:
                existing[definition.code] = Permission.objects.using(using).create(
                    code=definition.code, name=definition.name, module=module, assignable=definition.assignable
                )
            elif (perm.name, perm.module, perm.assignable) != (definition.name, module, definition.assignable):
                perm.name, perm.module, perm.assignable = definition.name, module, definition.assignable
                perm.save(using=using)

        for role_def in SYSTEM_ROLES:
            role, _ = Role.objects.using(using).update_or_create(
                key=role_def.key,
                business=None,
                defaults={"name": role_def.name, "description": role_def.description, "is_system": True},
            )
            wanted = {existing[code].pk for code in role_def.permissions}
            current = set(
                RolePermission.objects.using(using).filter(role=role).values_list("permission_id", flat=True)
            )
            RolePermission.objects.using(using).filter(role=role, permission_id__in=current - wanted).delete()
            RolePermission.objects.using(using).bulk_create(
                [RolePermission(role=role, permission_id=pid) for pid in wanted - current]
            )

        # Codes removed from the registry are dropped (role assignments cascade).
        stale = set(existing) - {d.code for d in PERMISSIONS}
        if stale:
            Permission.objects.using(using).filter(code__in=stale).delete()
            logger.warning("Removed stale permissions", extra={"codes": sorted(stale)})
