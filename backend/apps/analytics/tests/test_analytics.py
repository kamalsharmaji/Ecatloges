from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
from rest_framework.test import APIClient

from apps.analytics.models import AnalyticsEvent
from apps.enquiries.models import Enquiry
from conftest import activate_subscription, owner_of

pytestmark = pytest.mark.django_db
BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
OVERVIEW = "/api/v1/analytics/overview/"


@pytest.fixture
def shop(make_business, make_plan, make_category, make_product, make_catalogue):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(analytics_enabled=True))
    category = make_category(business)
    live = make_product(business, category=category, name="Wooden Chair", status="published")
    draft = make_product(business, category=category, name="Draft", status="draft")
    catalogue = make_catalogue(business, name="Furniture", products=[live, draft], status="published")
    return {"business": business, "catalogue": catalogue, "live": live, "draft": draft}


def track(shop, visitor="visitor-aaaaaaaaaaaa", ua=BROWSER, catalogue=None, **body):
    business, catalogue = shop["business"], catalogue or shop["catalogue"]
    return APIClient().post(
        f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/events/",
        {"visitor_id": visitor, **body}, format="json", HTTP_USER_AGENT=ua,
    )


# --- What counts as a view --------------------------------------------------------------------
def test_views_are_recorded_once_per_visitor_window(shop):
    assert track(shop).json() == {"recorded": True}
    assert track(shop).json() == {"recorded": False}  # same visitor within 30 minutes
    assert track(shop, visitor="visitor-bbbbbbbbbbbb", ua=DESKTOP, source="qr_code").json() == {"recorded": True}
    assert track(shop, product_id=str(shop["live"].id)).json() == {"recorded": True}  # product view is separate
    events = AnalyticsEvent.objects.order_by("id")
    assert [e.event_type for e in events] == ["catalogue_view", "catalogue_view", "product_view"]
    assert [e.device for e in events] == ["mobile", "desktop", "mobile"]
    assert events[1].source == "qr_code"
    # Window expired → counted again.
    AnalyticsEvent.objects.update(created_at=datetime.now(dt_timezone.utc) - timedelta(minutes=31))
    assert track(shop).json() == {"recorded": True}


def test_no_personal_data_is_stored(shop):
    track(shop, visitor="visitor-aaaaaaaaaaaa")
    event = AnalyticsEvent.objects.get()
    assert "visitor-aaaaaaaaaaaa" not in event.visitor_key and len(event.visitor_key) == 64
    field_names = {f.name for f in AnalyticsEvent._meta.get_fields()}
    assert not {"ip", "ip_address", "user_agent"} & field_names


@pytest.mark.parametrize("ua", ["", "Googlebot/2.1", "facebookexternalhit/1.1", "WhatsApp/2.23", "python-requests/2.31"])
def test_bots_and_previewers_are_ignored(shop, ua):
    assert track(shop, ua=ua).json() == {"recorded": False}
    assert not AnalyticsEvent.objects.exists()


def test_unpublished_content_generates_no_events(shop):
    assert track(shop, product_id=str(shop["draft"].id)).json() == {"recorded": False}
    shop["catalogue"].status = "draft"
    shop["catalogue"].save()
    assert track(shop).status_code == 404
    assert not AnalyticsEvent.objects.exists()


@pytest.mark.parametrize("visitor", ["short", "has spaces in it!!", "x" * 65])
def test_invalid_visitor_ids_rejected(shop, visitor):
    assert track(shop, visitor=visitor).status_code == 400


# --- Reporting --------------------------------------------------------------------------------
def _event(shop, when, **extra):
    event = AnalyticsEvent.objects.create(
        business=shop["business"], catalogue=shop["catalogue"], event_type=extra.pop("event_type", "catalogue_view"),
        visitor_key=extra.pop("visitor_key", "k" * 64), **extra,
    )
    AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=when)


def test_overview_totals_series_and_timezone_boundaries(shop):
    # 2026-10-17 20:00 UTC is already 18 Oct (01:30) in Asia/Kolkata.
    late = datetime(2026, 10, 17, 20, 0, tzinfo=dt_timezone.utc)
    _event(shop, late, source="whatsapp", device="mobile", visitor_key="a" * 64)
    _event(shop, late, event_type="product_view", product=shop["live"], visitor_key="a" * 64)
    _event(shop, datetime(2026, 10, 16, 10, 0, tzinfo=dt_timezone.utc), source="qr_code", device="desktop", visitor_key="b" * 64)
    enquiry = Enquiry.objects.create(business=shop["business"], catalogue=shop["catalogue"], product=shop["live"],
                                     name="A", phone="+919000000001", message="m", status="converted",
                                     converted_at=late)
    Enquiry.objects.filter(pk=enquiry.pk).update(created_at=late)
    client = APIClient()
    client.force_authenticate(owner_of(shop["business"]))
    client.defaults["HTTP_X_BUSINESS_ID"] = str(shop["business"].id)

    ist = client.get(OVERVIEW, {"from": "2026-10-16", "to": "2026-10-18", "tz": "Asia/Kolkata"}).json()
    assert ist["totals"] == {"catalogue_views": 2, "product_views": 1, "unique_visitors": 2, "products_viewed": 1,
                             "enquiries": 1, "conversions": 1}
    series = {p["date"]: p for p in ist["series"]}
    assert list(series) == ["2026-10-16", "2026-10-17", "2026-10-18"]
    assert series["2026-10-18"]["catalogue_views"] == 1 and series["2026-10-17"]["catalogue_views"] == 0
    assert series["2026-10-18"]["enquiries"] == 1
    utc = client.get(OVERVIEW, {"from": "2026-10-16", "to": "2026-10-18", "tz": "UTC"}).json()
    assert {p["date"]: p["catalogue_views"] for p in utc["series"]}["2026-10-17"] == 1
    sources = {s["key"]: s["count"] for s in ist["sources"]}
    assert sources["whatsapp"] == 1 and sources["qr_code"] == 1 and sources["direct"] == 0
    assert {d["key"]: d["count"] for d in ist["devices"]}["desktop"] == 1
    assert {s["key"]: s["count"] for s in ist["enquiries_by_status"]}["converted"] == 1
    assert ist["top_catalogues"][0]["name"] == "Furniture" and ist["top_catalogues"][0]["views"] == 2
    assert ist["top_products"][0]["name"] == "Wooden Chair" and ist["top_products"][0]["enquiries"] == 1
    # The previous period (13–15 Oct) is empty.
    assert ist["previous"]["catalogue_views"] == 0


def test_empty_range_returns_zeros_not_fake_data(shop):
    client = APIClient()
    client.force_authenticate(owner_of(shop["business"]))
    body = client.get(OVERVIEW, {"from": "2026-01-01", "to": "2026-01-07"}, HTTP_X_BUSINESS_ID=str(shop["business"].id)).json()
    assert body["totals"]["catalogue_views"] == 0 and len(body["series"]) == 7
    assert body["top_catalogues"] == [] and body["top_products"] == []


@pytest.mark.parametrize(
    "params", [{"from": "2026-10-10", "to": "2026-10-01"}, {"from": "2024-01-01", "to": "2026-01-01"}, {"tz": "Mars/Base"}, {"from": "yesterday"}]
)
def test_invalid_ranges(shop, owner_client, params):
    assert owner_client(shop["business"]).get(OVERVIEW, params).status_code == 400


def test_analytics_permissions_and_plan_flag(shop, add_member, client_for, make_business):
    business = shop["business"]
    staff = client_for(add_member(business, "staff").user, business)
    manager = client_for(add_member(business, "manager").user, business)
    assert staff.get(OVERVIEW).status_code == 403  # staff role has no analytics.view
    assert manager.get(OVERVIEW).status_code == 200
    basic = make_business()  # default test plan: analytics_enabled = False
    response = client_for(owner_of(basic), basic).get(OVERVIEW)
    assert response.status_code == 402 and response.json()["error"]["code"] == "feature_not_in_plan"
    unpaid = make_business(subscribed=False)
    assert client_for(owner_of(unpaid), unpaid).get(OVERVIEW).status_code == 402


def test_analytics_are_tenant_isolated(shop, make_business, make_plan, make_catalogue, client_for):
    other = make_business(subscribed=False)
    activate_subscription(other, make_plan(analytics_enabled=True))
    track(shop)
    track(shop, visitor="visitor-cccccccccccc")
    client = client_for(owner_of(other), other)
    assert client.get(OVERVIEW).json()["totals"]["catalogue_views"] == 0
    # The header cannot be pointed at another business.
    assert client.get(OVERVIEW, HTTP_X_BUSINESS_ID=str(shop["business"].id)).status_code == 404


def test_list_counters_on_catalogues_and_products(shop, owner_client):
    track(shop)
    track(shop, visitor="visitor-dddddddddddd")
    track(shop, product_id=str(shop["live"].id))
    Enquiry.objects.create(business=shop["business"], catalogue=shop["catalogue"], product=shop["live"],
                           name="A", phone="+919000000001", message="m")
    client = owner_client(shop["business"])
    catalogue = client.get("/api/v1/catalogues/").json()["results"][0]
    assert catalogue["view_count"] == 2 and catalogue["enquiry_count"] == 1 and catalogue["product_count"] == 2
    products = {p["name"]: p for p in client.get("/api/v1/products/").json()["results"]}
    assert products["Wooden Chair"]["view_count"] == 1 and products["Wooden Chair"]["enquiry_count"] == 1
    assert products["Draft"]["view_count"] == 0
