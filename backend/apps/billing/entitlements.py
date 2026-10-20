"""
Subscription-based access control.

Every feature that consumes a plan limit calls `assert_within_limit(business, "<limit key>")`
before creating anything. Limits come from the subscription's purchase-time snapshot, so editing a
Plan never changes an existing customer's entitlements mid-period.

Usage counters are registered per limit key; later phases register catalogues, products and storage.
"""
from collections.abc import Callable

from django.utils import timezone
from rest_framework import exceptions

from apps.core.exceptions import PlanLimitExceeded


class SubscriptionRequired(exceptions.APIException):
    status_code = 402
    default_detail = "An active subscription is required for this action. Choose a plan to continue."
    default_code = "subscription_required"


def _staff_seats(business) -> int:
    from apps.businesses.models import BusinessMembership, StaffInvitation

    members = BusinessMembership.objects.filter(business=business, status=BusinessMembership.Status.ACTIVE).count()
    invites = StaffInvitation.objects.filter(
        business=business, status=StaffInvitation.Status.PENDING, expires_at__gt=timezone.now()
    ).count()
    return members + invites


# limit key -> function(business) -> current usage
USAGE_COUNTERS: dict[str, Callable] = {"max_staff": _staff_seats}

LIMIT_LABELS = {
    "max_staff": "team seats",
    "max_catalogues": "catalogues",
    "max_products": "products",
    "storage_limit_mb": "MB of storage",
}


def register_usage_counter(limit_key: str, counter: Callable) -> None:
    USAGE_COUNTERS[limit_key] = counter


def usage_for(business) -> dict[str, int]:
    return {key: counter(business) for key, counter in USAGE_COUNTERS.items()}


def limit_violations(business, limits: dict) -> list[dict]:
    """Usage that would not fit within `limits` (used before plan changes)."""
    out = []
    for key, used in usage_for(business).items():
        limit = limits.get(key)
        if limit is not None and used > limit:
            out.append({"limit": key, "allowed": limit, "used": used})
    return out


def current_subscription(business):
    from .services import current_subscription as _current

    return _current(business)


def require_paid_access(business):
    subscription = current_subscription(business)
    if subscription is None:
        raise SubscriptionRequired()
    return subscription


def lock_business(business) -> None:
    """
    Serialise limit-sensitive writes for one business (SELECT … FOR UPDATE on its row), so two
    concurrent requests cannot both pass a "count < limit" check. Call inside transaction.atomic().
    """
    from apps.businesses.models import Business

    Business.objects.select_for_update().only("pk").get(pk=business.pk)


def assert_within_limit(business, limit_key: str, adding: int = 1):
    subscription = require_paid_access(business)
    limit = subscription.limits.get(limit_key)
    if limit is None:
        return subscription
    used = USAGE_COUNTERS[limit_key](business)
    if used + adding > limit:
        label = LIMIT_LABELS.get(limit_key, limit_key)
        raise PlanLimitExceeded(
            f"Your plan allows {limit} {label} and you are using {used}. Upgrade your plan to add more.",
            code="plan_limit_exceeded",
        )
    return subscription


def feature_enabled(business, flag: str) -> bool:
    subscription = current_subscription(business)
    return bool(subscription and subscription.limits.get(flag))
