"""
Platform announcements.

Lifecycle: draft → (publish) → scheduled (start in the future) or published → unpublished ⇄ published
→ archived. Delivery (in-app notifications + optional opted-in emails) happens exactly once per
announcement: `deliver()` locks the row and sets `delivered_at`, and every notification carries the
dedup key `announcement:<id>`, so retried jobs, double clicks and re-publishing never send twice.

Audiences are resolved only from what an admin explicitly chose — never broader:
- all_businesses: active members of active businesses
- business_owners: active owners of active businesses
- selected_businesses: active members of the chosen (active) businesses
- platform_staff: active Super/Support Admins
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import PlatformRole
from apps.audit_logs import services as audit
from apps.businesses.models import Business, BusinessMembership
from apps.core.exceptions import BusinessRuleViolation
from apps.rbac.registry import OWNER

from .emails import send_email
from .models import Announcement, AnnouncementAudience, AnnouncementStatus
from .preferences import email_enabled
from .services import notify

logger = logging.getLogger("apps.notifications.announcements")
A = AnnouncementAudience
S = AnnouncementStatus


def audience_users(audience: str, business_ids=()):
    users = get_user_model().objects.filter(is_active=True)
    active_member = Q(
        memberships__status=BusinessMembership.Status.ACTIVE,
        memberships__business__status=Business.Status.ACTIVE,
    )
    if audience == A.ALL_BUSINESSES:
        return users.filter(active_member).distinct()
    if audience == A.BUSINESS_OWNERS:
        return users.filter(
            active_member, memberships__role__key=OWNER, memberships__role__business__isnull=True
        ).distinct()
    if audience == A.SELECTED_BUSINESSES:
        if not business_ids:
            return users.none()
        return users.filter(active_member, memberships__business_id__in=list(business_ids)).distinct()
    if audience == A.PLATFORM_STAFF:
        return users.filter(platform_role__in=[PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT_ADMIN])
    return users.none()


def recipients_of(announcement: Announcement):
    return audience_users(announcement.audience, list(announcement.businesses.values_list("pk", flat=True)))


def _validate_for_publish(announcement: Announcement) -> None:
    if announcement.audience == A.SELECTED_BUSINESSES and not announcement.businesses.exists():
        raise BusinessRuleViolation("Choose at least one business for this audience.", code="audience_empty")
    if announcement.ends_at and announcement.ends_at <= timezone.now():
        raise BusinessRuleViolation("The end time is already in the past.", code="announcement_expired")


@transaction.atomic
def publish(announcement: Announcement, *, actor) -> Announcement:
    announcement = Announcement.objects.select_for_update().get(pk=announcement.pk)
    if announcement.status == S.ARCHIVED:
        raise BusinessRuleViolation("Archived announcements can't be published.", code="announcement_archived")
    _validate_for_publish(announcement)
    now = timezone.now()
    before = announcement.status
    if announcement.starts_at and announcement.starts_at > now:
        announcement.status = S.SCHEDULED
    else:
        announcement.status = S.PUBLISHED
        announcement.published_at = announcement.published_at or now
    announcement.updated_by = actor
    announcement.save()
    audit.record_platform(actor, f"announcement.{announcement.status}", target=announcement,
                          changes={"status": {"from": before, "to": announcement.status}},
                          metadata={"audience": announcement.audience})
    if announcement.status == S.PUBLISHED:
        deliver(announcement)
    return announcement


@transaction.atomic
def set_status(announcement: Announcement, status: str, *, actor) -> Announcement:
    """unpublish / archive. Notifications already delivered stay in people's inboxes."""
    announcement = Announcement.objects.select_for_update().get(pk=announcement.pk)
    allowed = {
        S.UNPUBLISHED: {S.PUBLISHED, S.SCHEDULED},
        S.ARCHIVED: {S.DRAFT, S.SCHEDULED, S.PUBLISHED, S.UNPUBLISHED},
    }
    if announcement.status not in allowed[status]:
        raise BusinessRuleViolation(
            f"A {announcement.get_status_display().lower()} announcement can't be {S(status).label.lower()}.",
            code="invalid_status_transition",
        )
    before = announcement.status
    announcement.status = status
    announcement.updated_by = actor
    announcement.save()
    audit.record_platform(actor, f"announcement.{status}", target=announcement,
                          changes={"status": {"from": before, "to": status}})
    return announcement


def deliver(announcement: Announcement) -> int:
    """Create notifications (and queue opted-in emails) once. Call inside a transaction."""
    announcement = Announcement.objects.select_for_update().get(pk=announcement.pk)
    if announcement.delivered_at is not None:
        return 0
    users = list(recipients_of(announcement))
    notify(
        users,
        event="announcement.published",
        category="announcement",
        level=announcement.level,
        title=announcement.title,
        body=announcement.body[:300],
        link="/app/notifications",
        target=announcement,
        dedup_key=f"announcement:{announcement.pk}",
    )
    announcement.delivered_at = timezone.now()
    announcement.recipient_count = len(users)
    announcement.save(update_fields=["delivered_at", "recipient_count", "updated_at"])
    if announcement.send_email:
        emails = [u for u in users if u.email and email_enabled(u, "announcement")]
        transaction.on_commit(lambda: _send_emails(announcement, emails))
    logger.info("Announcement delivered", extra={"announcement_id": str(announcement.pk), "recipients": len(users)})
    return len(users)


def _send_emails(announcement: Announcement, users) -> None:
    for user in users:
        send_email(
            "announcement.published",
            to=user.email,
            context={
                "name": user.full_name or user.email,
                "title": announcement.title,
                "message": announcement.body,
                "url": f"{settings.FRONTEND_URL}/app/notifications",
            },
        )


def deliver_due(now=None) -> int:
    """Publish scheduled announcements whose start time has arrived (run by a scheduled command)."""
    now = now or timezone.now()
    count = 0
    for pk in Announcement.objects.filter(status=S.SCHEDULED, starts_at__lte=now).values_list("pk", flat=True):
        with transaction.atomic():
            announcement = Announcement.objects.select_for_update().get(pk=pk)
            if announcement.status != S.SCHEDULED:  # changed concurrently
                continue
            if announcement.ends_at and announcement.ends_at <= now:
                announcement.status = S.UNPUBLISHED  # window passed before it could go out
                announcement.save(update_fields=["status", "updated_at"])
                continue
            announcement.status = S.PUBLISHED
            announcement.published_at = announcement.published_at or now
            announcement.save(update_fields=["status", "published_at", "updated_at"])
            audit.record("announcement.published", target=announcement, scope="platform",
                         metadata={"scheduled": True})
            deliver(announcement)
            count += 1
    return count


def feed_for(user, now=None):
    """Live announcements addressed to `user` (published and inside the start/end window)."""
    now = now or timezone.now()
    live = Announcement.objects.filter(status=S.PUBLISHED).filter(
        Q(starts_at__isnull=True) | Q(starts_at__lte=now), Q(ends_at__isnull=True) | Q(ends_at__gt=now)
    )
    member_of = BusinessMembership.objects.filter(
        user=user, status=BusinessMembership.Status.ACTIVE, business__status=Business.Status.ACTIVE
    )
    audiences = Q(pk__in=[])
    if member_of.exists():
        audiences |= Q(audience=A.ALL_BUSINESSES)
        audiences |= Q(audience=A.SELECTED_BUSINESSES, businesses__in=member_of.values("business_id"))
    if member_of.filter(role__key=OWNER, role__business__isnull=True).exists():
        audiences |= Q(audience=A.BUSINESS_OWNERS)
    if user.is_platform_admin:
        audiences |= Q(audience=A.PLATFORM_STAFF)
    return live.filter(audiences).distinct().order_by("-published_at")
