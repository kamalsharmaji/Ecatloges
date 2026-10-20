"""
Platform-level permissions (Super Admin panel).

Completely separate from business RBAC: these codes are derived from User.platform_role, are
prefixed with "platform.", and can never be stored in a business Role.
"""
from rest_framework.permissions import BasePermission

from .models import PlatformRole

PLATFORM_VIEW = frozenset(
    {
        "platform.plan.view",
        "platform.subscription.view",
        "platform.payment.view",
        "platform.invoice.view",
    }
)
PLATFORM_MANAGE = frozenset(
    {
        "platform.plan.manage",
        "platform.subscription.manage",
        "platform.payment.reconcile",
    }
)
# Phase 7. Support Admins handle tickets — that is their job — but get nothing else new.
# The platform-wide audit trail stays with Super Admins only.
PLATFORM_SUPPORT = frozenset({"platform.support.view", "platform.support.manage"})
PLATFORM_AUDIT = frozenset({"platform.audit_log.view"})
# Phase 8: global content that reaches every customer — Super Admin only.
PLATFORM_CONTENT = frozenset({"platform.announcement.manage", "platform.email_template.manage"})
# Phase 9: platform-wide oversight (every business's data) — Super Admin only.
PLATFORM_OVERSIGHT = frozenset({
    "platform.dashboard.view",
    "platform.business.view", "platform.business.manage",
    "platform.user.view", "platform.user.manage",
    "platform.catalogue.view", "platform.catalogue.manage",
    "platform.system.view",
})
ALL_PLATFORM_PERMISSIONS = (
    PLATFORM_VIEW | PLATFORM_MANAGE | PLATFORM_SUPPORT | PLATFORM_AUDIT | PLATFORM_CONTENT | PLATFORM_OVERSIGHT
)

# Role → permissions is defined in code (not per user), so changing this mapping changes access
# for everyone holding the role on the next request. Any change must be listed in docs/ARCHITECTURE.md.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    PlatformRole.SUPER_ADMIN: ALL_PLATFORM_PERMISSIONS,
    PlatformRole.SUPPORT_ADMIN: PLATFORM_VIEW | PLATFORM_SUPPORT,
}


def platform_permissions(user) -> frozenset[str]:
    if not user or not user.is_authenticated or not user.is_active:
        return frozenset()
    return ROLE_PERMISSIONS.get(user.platform_role, frozenset())


class HasPlatformPermission(BasePermission):
    """
    Views declare `required_platform_permissions = {"list": "platform.plan.view", ...}` keyed by
    action (or lower-case HTTP method). Missing keys are denied.
    """

    def has_permission(self, request, view):
        action = getattr(view, "action", None) or request.method.lower()
        required = getattr(view, "required_platform_permissions", {}).get(action)
        if required is None:
            return False
        if isinstance(required, str):
            required = (required,)
        granted = platform_permissions(request.user)
        return all(code in granted for code in required)
