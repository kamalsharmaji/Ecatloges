import hashlib
import hmac
import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import exceptions

from .models import AnalyticsEvent, Device, EventType, TrafficSource

DEDUP_WINDOW = timedelta(minutes=30)
MAX_RANGE_DAYS = 366
VISITOR_ID_RE = re.compile(r"^[A-Za-z0-9-]{16,64}$")
BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|skype|discord|headless|lighthouse|python-requests|curl|wget",
    re.IGNORECASE,
)


def is_bot(user_agent: str) -> bool:
    return not user_agent or bool(BOT_RE.search(user_agent))


def classify_device(user_agent: str) -> str:
    ua = user_agent.lower()
    if "ipad" in ua or "tablet" in ua or ("android" in ua and "mobile" not in ua):
        return Device.TABLET
    if "mobi" in ua or "iphone" in ua or "android" in ua:
        return Device.MOBILE
    if any(k in ua for k in ("windows", "macintosh", "x11", "linux", "cros")):
        return Device.DESKTOP
    return Device.OTHER


def visitor_key(business_id, visitor_id: str) -> str:
    message = f"{business_id}:{visitor_id}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def record_view(*, catalogue, product, visitor_id: str, source: str, user_agent: str) -> bool:
    """Record one de-duplicated view. Returns False when ignored (bot or repeat within 30 minutes)."""
    if not VISITOR_ID_RE.match(visitor_id or ""):
        raise exceptions.ValidationError({"visitor_id": ["Invalid visitor id."]})
    if is_bot(user_agent):
        return False
    event_type = EventType.PRODUCT_VIEW if product else EventType.CATALOGUE_VIEW
    key = visitor_key(catalogue.business_id, visitor_id)
    recent = AnalyticsEvent.objects.filter(
        visitor_key=key,
        catalogue=catalogue,
        event_type=event_type,
        product=product,
        created_at__gte=timezone.now() - DEDUP_WINDOW,
    )
    if recent.exists():
        return False
    AnalyticsEvent.objects.create(
        business_id=catalogue.business_id,
        catalogue=catalogue,
        product=product,
        event_type=event_type,
        source=source if source in TrafficSource.values else TrafficSource.OTHER,
        device=classify_device(user_agent),
        visitor_key=key,
    )
    return True


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def parse_range(params) -> tuple[date, date, ZoneInfo]:
    """?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City (inclusive dates in the given timezone)."""
    try:
        tz = ZoneInfo(params.get("tz") or settings.TIME_ZONE)
    except (ZoneInfoNotFoundError, ValueError):
        raise exceptions.ValidationError({"tz": ["Unknown timezone."]}) from None
    today = timezone.now().astimezone(tz).date()
    try:
        end = date.fromisoformat(params["to"]) if params.get("to") else today
        start = date.fromisoformat(params["from"]) if params.get("from") else end - timedelta(days=29)
    except ValueError:
        raise exceptions.ValidationError({"from": ["Use dates like 2026-10-01."]}) from None
    if start > end:
        raise exceptions.ValidationError({"from": ["Start date must be before end date."]})
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise exceptions.ValidationError({"from": [f"Choose a range of at most {MAX_RANGE_DAYS} days."]})
    return start, end, tz


def bounds(start: date, end: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Timezone-aware [start 00:00, end+1 00:00) in the business's local time."""
    return datetime.combine(start, time.min, tz), datetime.combine(end + timedelta(days=1), time.min, tz)


def _totals(business, lo, hi) -> dict:
    from apps.enquiries.models import Enquiry

    events = AnalyticsEvent.objects.filter(business=business, created_at__gte=lo, created_at__lt=hi)
    agg = events.aggregate(
        catalogue_views=Count("id", filter=Q(event_type=EventType.CATALOGUE_VIEW)),
        product_views=Count("id", filter=Q(event_type=EventType.PRODUCT_VIEW)),
        unique_visitors=Count("visitor_key", distinct=True),
        products_viewed=Count("product", filter=Q(event_type=EventType.PRODUCT_VIEW), distinct=True),
    )
    enquiries = Enquiry.objects.filter(business=business)
    agg["enquiries"] = enquiries.filter(created_at__gte=lo, created_at__lt=hi).count()
    agg["conversions"] = enquiries.filter(converted_at__gte=lo, converted_at__lt=hi).count()
    return agg


def overview(business, start: date, end: date, tz: ZoneInfo) -> dict:
    from apps.catalogues.models import Catalogue
    from apps.enquiries.models import Enquiry
    from apps.products.models import Product

    lo, hi = bounds(start, end, tz)
    days = (end - start).days + 1
    prev_lo, prev_hi = bounds(start - timedelta(days=days), start - timedelta(days=1), tz)
    events = AnalyticsEvent.objects.filter(business=business, created_at__gte=lo, created_at__lt=hi)
    enquiries = Enquiry.objects.filter(business=business, created_at__gte=lo, created_at__lt=hi)

    views_by_day = dict(
        events.filter(event_type=EventType.CATALOGUE_VIEW)
        .annotate(day=TruncDate("created_at", tzinfo=tz)).values("day").annotate(n=Count("id")).values_list("day", "n")
    )
    product_views_by_day = dict(
        events.filter(event_type=EventType.PRODUCT_VIEW)
        .annotate(day=TruncDate("created_at", tzinfo=tz)).values("day").annotate(n=Count("id")).values_list("day", "n")
    )
    enquiries_by_day = dict(
        enquiries.annotate(day=TruncDate("created_at", tzinfo=tz)).values("day").annotate(n=Count("id")).values_list("day", "n")
    )
    series = [
        {
            "date": d.isoformat(),
            "catalogue_views": views_by_day.get(d, 0),
            "product_views": product_views_by_day.get(d, 0),
            "enquiries": enquiries_by_day.get(d, 0),
        }
        for d in (start + timedelta(days=i) for i in range(days))
    ]

    def breakdown(field, choices, qs):
        counts = dict(qs.values(field).annotate(n=Count("id")).values_list(field, "n"))
        return [{"key": k, "label": label, "count": counts.get(k, 0)} for k, label in choices]

    devices_qs = events.values("device").annotate(n=Count("visitor_key", distinct=True))
    device_counts = dict(devices_qs.values_list("device", "n"))

    top_catalogues = (
        Catalogue.objects.filter(business=business)
        .annotate(
            views=Count("analytics_events", filter=Q(
                analytics_events__event_type=EventType.CATALOGUE_VIEW,
                analytics_events__created_at__gte=lo, analytics_events__created_at__lt=hi), distinct=True),
            enquiry_count=Count("enquiries", filter=Q(enquiries__created_at__gte=lo, enquiries__created_at__lt=hi), distinct=True),
        )
        .filter(Q(views__gt=0) | Q(enquiry_count__gt=0))
        .select_related("cover")
        .order_by("-views", "-enquiry_count", "name")[:5]
    )
    top_products = (
        Product.objects.filter(business=business)
        .annotate(
            views=Count("analytics_events", filter=Q(
                analytics_events__created_at__gte=lo, analytics_events__created_at__lt=hi), distinct=True),
            enquiry_count=Count("enquiries", filter=Q(enquiries__created_at__gte=lo, enquiries__created_at__lt=hi), distinct=True),
        )
        .filter(Q(views__gt=0) | Q(enquiry_count__gt=0))
        .prefetch_related("media_items__asset")
        .order_by("-views", "-enquiry_count", "name")[:5]
    )

    from apps.enquiries.models import EnquiryStatus

    return {
        "range": {"from": start.isoformat(), "to": end.isoformat(), "tz": str(tz), "days": days},
        "totals": _totals(business, lo, hi),
        "previous": _totals(business, prev_lo, prev_hi),
        "series": series,
        "sources": breakdown("source", TrafficSource.choices, events.filter(event_type=EventType.CATALOGUE_VIEW)),
        "devices": [{"key": k, "label": label, "count": device_counts.get(k, 0)} for k, label in Device.choices],
        "enquiries_by_status": breakdown("status", EnquiryStatus.choices, enquiries),
        "top_catalogues": top_catalogues,
        "top_products": top_products,
    }
