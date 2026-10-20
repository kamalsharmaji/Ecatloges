"""
Platform-wide aggregates and Super Admin lifecycle actions.

All figures are database aggregates over real rows. Money is never summed across currencies, and
payments from the mock gateway (`is_test`) are reported separately, never as revenue. Refunds are not
modelled by the billing app, so they are reported as "not tracked" rather than as zero.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from apps.accounts.models import PlatformRole
from apps.accounts.services import revoke_all_refresh_tokens
from apps.audit_logs import services as audit
from apps.audit_logs.models import AuditLog, AuditScope
from apps.billing.models import Payment, Subscription
from apps.businesses.models import Business, BusinessMembership
from apps.catalogues.models import Catalogue, CatalogueStatus
from apps.core.exceptions import BusinessRuleViolation
from apps.enquiries.models import Enquiry
from apps.media_library.models import MediaAsset
from apps.notifications.models import NotificationLevel
from apps.notifications.services import notify
from apps.products.models import Product
from apps.rbac.registry import OWNER
from apps.support.models import SupportTicket, TicketStatus

S = Subscription.Status
EXPIRING_DAYS = 7


def _month_starts(today: date, months: int) -> list[date]:
    starts, y, m = [], today.year, today.month
    for _ in range(months):
        starts.append(date(y, m, 1))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return list(reversed(starts))


def _current_subscription_qs():
    return Subscription.objects.filter(business=OuterRef("pk"), status__in=Subscription.CURRENT_STATUSES).order_by("-created_at")


def owners_of(business):
    return get_user_model().objects.filter(
        memberships__business=business, memberships__role__key=OWNER, memberships__role__business__isnull=True,
        memberships__status=BusinessMembership.Status.ACTIVE,
    ).distinct()


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
def dashboard(start: date, end: date, tz: ZoneInfo) -> dict:
    from apps.analytics.services import bounds

    lo, hi = bounds(start, end, tz)
    now = timezone.now()
    users = get_user_model().objects

    businesses = Business.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=Business.Status.ACTIVE)),
        suspended=Count("id", filter=Q(status=Business.Status.SUSPENDED)),
        new=Count("id", filter=Q(created_at__gte=lo, created_at__lt=hi)),
    )
    current = Subscription.objects.filter(status__in=Subscription.CURRENT_STATUSES)
    with_current = current.values("business_id").distinct()
    subscriptions = {
        "active": current.filter(status=S.ACTIVE).count(),
        "past_due": current.filter(status=S.PAST_DUE).count(),
        "expiring_soon": current.filter(status=S.ACTIVE, current_period_end__lte=now + timedelta(days=EXPIRING_DAYS)).count(),
        "cancelling": current.filter(status=S.ACTIVE, cancel_at_period_end=True).count(),
        # Businesses that had a plan but none is current any more.
        "lapsed": Subscription.objects.filter(status__in=[S.EXPIRED, S.CANCELLED]).exclude(business_id__in=with_current)
        .values("business_id").distinct().count(),
        "never_subscribed": Business.objects.exclude(
            pk__in=Subscription.objects.exclude(status__in=[S.PENDING_PAYMENT, S.ABANDONED]).values("business_id")
        ).count(),
    }

    paid = Payment.objects.filter(status=Payment.Status.CAPTURED, paid_at__gte=lo, paid_at__lt=hi)
    revenue = [
        {"currency": r["currency"], "gross": r["gross"], "tax": r["tax"], "payments": r["n"]}
        for r in paid.filter(is_test=False).values("currency").annotate(gross=Sum("amount"), tax=Sum("tax_amount"), n=Count("id")).order_by("currency")
    ]
    test_payments = paid.filter(is_test=True).count()

    months = _month_starts(timezone.localdate(now, tz), 6)
    month_lo = datetime(months[0].year, months[0].month, 1, tzinfo=tz)
    revenue_rows = (
        Payment.objects.filter(status=Payment.Status.CAPTURED, is_test=False, paid_at__gte=month_lo)
        .annotate(m=TruncMonth("paid_at", tzinfo=tz)).values("m", "currency").annotate(total=Sum("amount")).order_by("m")
    )
    currencies = sorted({r["currency"] for r in revenue_rows})
    revenue_series = [
        {"month": m.isoformat(), "totals": {c: next((str(r["total"]) for r in revenue_rows if r["m"].date() == m and r["currency"] == c), "0")
                                            for c in currencies}}
        for m in months
    ]
    growth_rows = dict(
        Business.objects.filter(created_at__gte=month_lo).annotate(m=TruncMonth("created_at", tzinfo=tz))
        .values("m").annotate(n=Count("id")).values_list("m", "n")
    )
    growth = [{"month": m.isoformat(), "count": next((n for k, n in growth_rows.items() if k.date() == m), 0)} for m in months]

    enquiries = Enquiry.objects.filter(created_at__gte=lo, created_at__lt=hi).aggregate(
        total=Count("id"), converted=Count("id", filter=Q(status="converted")),
    )
    storage = MediaAsset.objects.aggregate(o=Sum("size_bytes"), t=Sum("thumbnail_bytes"), p=Sum("preview_bytes"))

    top_plans = list(
        current.values("plan_name").annotate(subscribers=Count("business", distinct=True)).order_by("-subscribers", "plan_name")[:5]
    )
    top_categories = list(
        Business.objects.values("category").annotate(count=Count("id")).order_by("-count", "category")[:5]
    )
    expiring = (
        current.filter(status=S.ACTIVE, current_period_end__lte=now + timedelta(days=EXPIRING_DAYS))
        .select_related("business").order_by("current_period_end")[:6]
    )
    recent_businesses = (
        Business.objects.annotate(
            plan_name=Subquery(_current_subscription_qs().values("plan_name")[:1]),
            member_count=Count("memberships", filter=Q(memberships__status=BusinessMembership.Status.ACTIVE), distinct=True),
        ).order_by("-created_at")[:5]
    )
    recent_payments = Payment.objects.filter(status=Payment.Status.CAPTURED).select_related("business", "subscription").order_by("-paid_at")[:5]
    recent_events = AuditLog.objects.filter(
        Q(scope=AuditScope.PLATFORM) | Q(action__in=["business.created", "subscription.activated", "payment.failed", "support.ticket_created"])
    ).select_related("business").order_by("-created_at")[:8]

    return {
        "range": {"from": start, "to": end, "timezone": str(tz)},
        "businesses": businesses,
        "users": users.aggregate(
            total=Count("id"), active=Count("id", filter=Q(is_active=True)),
            new=Count("id", filter=Q(date_joined__gte=lo, date_joined__lt=hi)),
        ),
        "subscriptions": subscriptions,
        "revenue": revenue,
        "refunds_tracked": False,
        "test_payments": test_payments,
        "revenue_series": {"currencies": currencies, "months": revenue_series},
        "business_growth": growth,
        "content": {
            "catalogues": Catalogue.objects.count(),
            "published_catalogues": Catalogue.objects.filter(status=CatalogueStatus.PUBLISHED).count(),
            "products": Product.objects.count(),
            "storage_bytes": sum(v or 0 for v in storage.values()),
        },
        "enquiries": enquiries,
        "support": {
            "open": SupportTicket.objects.exclude(status__in=[TicketStatus.RESOLVED, TicketStatus.CLOSED]).count(),
            "unassigned": SupportTicket.objects.exclude(status__in=[TicketStatus.RESOLVED, TicketStatus.CLOSED]).filter(assigned_to__isnull=True).count(),
        },
        "top_plans": top_plans,
        "top_categories": top_categories,
        "expiring": [
            {"business_id": s.business_id, "business_name": s.business.name, "plan_name": s.plan_name, "ends_at": s.current_period_end,
             "cancelling": s.cancel_at_period_end}
            for s in expiring
        ],
        "recent_businesses": [
            {"id": b.id, "name": b.name, "status": b.status, "plan_name": b.plan_name or "", "members": b.member_count, "created_at": b.created_at}
            for b in recent_businesses
        ],
        "recent_payments": [
            {"id": p.id, "business_name": p.business.name, "plan_name": p.subscription.plan_name, "amount": p.amount,
             "currency": p.currency, "is_test": p.is_test, "paid_at": p.paid_at}
            for p in recent_payments
        ],
        "recent_events": [
            {"id": e.id, "action": e.action, "target_label": e.target_label, "business_name": e.business.name if e.business else "",
             "actor_name": e.actor_name or ("System" if e.actor_type == "system" else ""), "created_at": e.created_at}
            for e in recent_events
        ],
    }


# ---------------------------------------------------------------------------
# Business annotations shared by list/detail
# ---------------------------------------------------------------------------
def annotated_businesses():
    def count_of(model, **extra):
        return Coalesce(
            Subquery(model.objects.filter(business=OuterRef("pk"), **extra).values("business").annotate(n=Count("id")).values("n"),
                     output_field=IntegerField()), 0,
        )

    owner = BusinessMembership.objects.filter(
        business=OuterRef("pk"), role__key=OWNER, role__business__isnull=True
    ).order_by("created_at")
    sub = _current_subscription_qs()
    storage = (
        MediaAsset.objects.filter(business=OuterRef("pk")).values("business")
        .annotate(n=Coalesce(Sum("size_bytes"), 0) + Coalesce(Sum("thumbnail_bytes"), 0) + Coalesce(Sum("preview_bytes"), 0)).values("n")
    )
    return Business.objects.annotate(
        owner_full_name=Subquery(owner.values("user__full_name")[:1]),
        owner_email=Subquery(owner.values("user__email")[:1]),
        member_count=count_of(BusinessMembership, status=BusinessMembership.Status.ACTIVE),
        catalogue_count=count_of(Catalogue),
        product_count=count_of(Product),
        enquiry_count=count_of(Enquiry),
        storage_bytes=Coalesce(Subquery(storage, output_field=IntegerField()), 0),
        plan_name=Subquery(sub.values("plan_name")[:1]),
        subscription_status=Subquery(sub.values("status")[:1]),
        subscription_ends_at=Subquery(sub.values("current_period_end")[:1]),
    )


# ---------------------------------------------------------------------------
# Lifecycle actions
# ---------------------------------------------------------------------------
@transaction.atomic
def set_business_status(business: Business, *, status: str, reason: str, actor) -> Business:
    """
    Suspend / reactivate. Reversible and non-destructive: nothing is deleted, subscriptions and
    payments are untouched (verified payments still apply), only access is blocked while suspended.
    """
    business = Business.objects.select_for_update().get(pk=business.pk)
    if business.status == status:
        raise BusinessRuleViolation(f"This business is already {business.get_status_display().lower()}.", code="no_change")
    before = business.status
    business.status = status
    business.save(update_fields=["status", "updated_at"])
    action = "business.suspended" if status == Business.Status.SUSPENDED else "business.reactivated"
    audit.record_platform(actor, action, business=business, target=business, scope=AuditScope.BUSINESS,
                          changes={"status": {"from": before, "to": status}}, metadata={"reason": reason})
    # Business-less + mandatory so owners see it even while the business itself is hidden.
    suspended = status == Business.Status.SUSPENDED
    notify(
        list(owners_of(business)), event=action, category="system", mandatory=True,
        level=NotificationLevel.ERROR if suspended else NotificationLevel.SUCCESS,
        title=f"{business.name} was {'suspended' if suspended else 'reactivated'}",
        body=(f"Reason: {reason}. Contact support for help." if suspended else "Your team can use the business again.")[:300],
        link="/businesses", target=business,
        dedup_key=f"business:{business.pk}:{status}:{timezone.now().timestamp()}",
    )
    return business


def _active_super_admins():
    return get_user_model().objects.filter(platform_role=PlatformRole.SUPER_ADMIN, is_active=True)


@transaction.atomic
def update_user(user, *, actor, is_active=None, platform_role=None):
    """Activate/deactivate an account or change its platform role, never removing the last Super Admin."""
    User = get_user_model()
    user = User.objects.select_for_update().get(pk=user.pk)
    if user.pk == actor.pk:
        raise BusinessRuleViolation("You can't change your own account status or platform role.", code="self_change")
    changes = {}
    loses_super = user.platform_role == PlatformRole.SUPER_ADMIN and user.is_active and (
        is_active is False or (platform_role is not None and platform_role != PlatformRole.SUPER_ADMIN)
    )
    if loses_super:
        # Lock every active Super Admin row so two admins can't demote each other concurrently.
        if len(list(_active_super_admins().select_for_update())) <= 1:
            raise BusinessRuleViolation("At least one active Super Admin must remain.", code="last_super_admin")
    if platform_role is not None and platform_role != user.platform_role:
        changes["platform_role"] = {"from": user.platform_role or "none", "to": platform_role or "none"}
        user.platform_role = platform_role
    if is_active is not None and is_active != user.is_active:
        changes["is_active"] = {"from": user.is_active, "to": is_active}
        user.is_active = is_active
    if not changes:
        return user
    user.save(update_fields=["platform_role", "is_active", "updated_at"])
    if "is_active" in changes and not user.is_active:
        revoke_all_refresh_tokens(user)  # signed out everywhere; access tokens fail the is_active check
    audit.record_platform(actor, "user.updated", target=user, target_label=user.full_name or user.email,
                          scope=AuditScope.PLATFORM, changes=changes)
    return user


@transaction.atomic
def unpublish_catalogue(catalogue: Catalogue, *, reason: str, actor) -> Catalogue:
    """Moderation takedown: unpublish (to draft). Content is kept; the business is told why."""
    catalogue = Catalogue.objects.select_for_update().select_related("business").get(pk=catalogue.pk)
    if catalogue.status != CatalogueStatus.PUBLISHED:
        raise BusinessRuleViolation("Only published catalogues can be taken down.", code="not_published")
    catalogue.status = CatalogueStatus.DRAFT
    catalogue.save(update_fields=["status", "updated_at"])
    audit.record_platform(actor, "catalogue.taken_down", business=catalogue.business, target=catalogue,
                          scope=AuditScope.BUSINESS, changes={"status": {"from": "published", "to": "draft"}},
                          metadata={"reason": reason})
    from apps.notifications.services import notify_members

    notify_members(
        catalogue.business, "catalogue.view", event="catalogue.taken_down", category="catalogue", mandatory=True,
        level=NotificationLevel.WARNING, title="Catalogue unpublished by myEcatalogues",
        body=f"“{catalogue.name}” was unpublished. Reason: {reason}"[:300],
        link=f"/app/catalogues/{catalogue.pk}", target=catalogue,
        dedup_key=f"catalogue:{catalogue.pk}:takedown:{timezone.now().timestamp()}",
    )
    return catalogue
