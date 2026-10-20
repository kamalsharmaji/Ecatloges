"""
Create in-app notifications.

Call these inside the transaction that performs the change: if it rolls back, so do the
notifications. Recipients are chosen by *permission* at creation time, so people only hear about
things they are allowed to open. Email stays where it already was (e.g. enquiries.notify_business);
this module never sends email, so adding in-app messages cannot duplicate emails.
"""
import logging

from django.contrib.auth import get_user_model

from apps.accounts.models import PlatformRole

from .models import Notification, NotificationCategory, NotificationLevel
from .preferences import in_app_allowed

logger = logging.getLogger("apps.notifications")


def notify(
    recipients,
    *,
    event: str,
    title: str,
    body: str = "",
    business=None,
    category: str | None = None,
    level: str = NotificationLevel.INFO,
    link: str = "",
    target=None,
    dedup_key: str = "",
    mandatory: bool = False,
) -> int:
    """
    Create one notification per distinct recipient who wants it. Returns how many were attempted.
    Optional categories respect each user's in-app preference; `mandatory` (and locked groups such
    as billing) always deliver.
    """
    users = {u.pk: u for u in recipients if u is not None and u.is_active}
    category = category or event.split(".", 1)[0]
    if users and not mandatory:
        wanted = in_app_allowed(users, category)
        users = {pk: u for pk, u in users.items() if pk in wanted}
    if not users:
        return 0
    rows = [
        Notification(
            recipient_id=pk,
            business=business,
            category=category,
            event=event,
            level=level,
            title=title[:120],
            body=body[:300],
            link=link[:255],
            target_type=target._meta.model_name if target is not None else "",
            target_id=str(target.pk) if target is not None else "",
            dedup_key=dedup_key[:150],
        )
        for pk in users
    ]
    # ignore_conflicts + the (recipient, dedup_key) unique constraint = idempotent.
    Notification.objects.bulk_create(rows, ignore_conflicts=bool(dedup_key))
    logger.info("Notifications created", extra={"event": event, "count": len(rows)})
    return len(rows)


def business_members_with(business, permission: str, *, exclude=None):
    """Active users of an active business whose role grants `permission`."""
    from apps.businesses.models import Business, BusinessMembership

    if business is None or business.status != Business.Status.ACTIVE:
        return []
    users = (
        get_user_model().objects.filter(
            is_active=True,
            memberships__business=business,
            memberships__status=BusinessMembership.Status.ACTIVE,
            memberships__role__permissions__code=permission,
        )
        .distinct()
    )
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
    return list(users)


def notify_members(business, permission: str, *, exclude=None, **kwargs) -> int:
    return notify(business_members_with(business, permission, exclude=exclude), business=business, **kwargs)


def platform_support_staff(*, exclude=None):
    users = get_user_model().objects.filter(
        is_active=True, platform_role__in=[PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT_ADMIN]
    )
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
    return list(users)


__all__ = ["NotificationCategory", "NotificationLevel", "notify", "notify_members", "platform_support_staff"]
