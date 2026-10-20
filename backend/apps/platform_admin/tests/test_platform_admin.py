from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.services import issue_tokens
from apps.audit_logs.models import AuditLog
from apps.billing.models import Payment, Subscription
from apps.businesses.models import Business
from apps.notifications.models import Notification
from conftest import owner_of

ADMIN = "/api/v1/admin"
ENDPOINTS = [
    f"{ADMIN}/dashboard/", f"{ADMIN}/system/", f"{ADMIN}/businesses/", f"{ADMIN}/businesses/summary/",
    f"{ADMIN}/users/", f"{ADMIN}/users/summary/", f"{ADMIN}/catalogues/", f"{ADMIN}/catalogues/summary/",
]


@pytest.fixture
def root(make_user, client_for):
    user = make_user(platform_role="super_admin", full_name="Root Admin")
    return user, client_for(user)


def payment(business, amount, *, currency="INR", is_test=False, status="captured", paid_at=None):
    sub = Subscription.objects.filter(business=business).first()
    return Payment.objects.create(
        business=business, subscription=sub, kind="new", provider="mock", provider_order_id=f"o-{Payment.objects.count()}",
        status=status, amount=Decimal(amount), subtotal=Decimal(amount), currency=currency, is_test=is_test,
        paid_at=paid_at or timezone.now(), expires_at=timezone.now() + timedelta(hours=1),
    )


# --- Authorization ------------------------------------------------------------------------------
@pytest.mark.parametrize("url", ENDPOINTS)
def test_only_super_admin_can_read_platform_data(url, make_user, make_business, client_for):
    business = make_business()
    assert APIClient().get(url).status_code == 401
    assert client_for(owner_of(business), business).get(url).status_code == 403
    assert client_for(make_user(platform_role="support_admin")).get(url).status_code == 403
    assert client_for(make_user(platform_role="super_admin")).get(url).status_code == 200


def test_support_admin_cannot_act(make_user, make_business, make_catalogue, client_for):
    business = make_business()
    agent = client_for(make_user(platform_role="support_admin"))
    catalogue = make_catalogue(business, status="published")
    assert agent.post(f"{ADMIN}/businesses/{business.id}/suspend/", {"reason": "Testing abuse"}, format="json").status_code == 403
    assert agent.post(f"{ADMIN}/catalogues/{catalogue.id}/unpublish/", {"reason": "Testing abuse"}, format="json").status_code == 403
    assert agent.patch(f"{ADMIN}/users/{owner_of(business).id}/", {"is_active": False}, format="json").status_code == 403
    business.refresh_from_db()
    assert business.status == "active"


# --- Dashboard aggregation -----------------------------------------------------------------------
def test_dashboard_revenue_is_per_currency_and_excludes_test_payments(root, make_business):
    _, client = root
    a, b = make_business(), make_business()
    payment(a, "1000.00")
    payment(b, "2500.00")
    payment(a, "50.00", currency="USD")
    payment(a, "999.00", is_test=True)               # mock gateway → not revenue
    payment(b, "700.00", status="failed")             # not captured → not revenue
    payment(a, "300.00", paid_at=timezone.now() - timedelta(days=90))  # outside the 30-day range

    data = client.get(f"{ADMIN}/dashboard/").json()
    revenue = {r["currency"]: r for r in data["revenue"]}
    assert Decimal(revenue["INR"]["gross"]) == Decimal("3500.00") and revenue["INR"]["payments"] == 2
    assert Decimal(revenue["USD"]["gross"]) == Decimal("50.00")
    assert data["test_payments"] == 1 and data["refunds_tracked"] is False
    # The 6-month series includes the older payment but never mixes currencies.
    assert set(data["revenue_series"]["currencies"]) == {"INR", "USD"}
    assert sum(Decimal(m["totals"]["INR"]) for m in data["revenue_series"]["months"]) == Decimal("3800.00")


def test_dashboard_counts(root, make_business, make_catalogue, make_product):
    _, client = root
    a = make_business()
    b = make_business(subscribed=False)
    Business.objects.filter(pk=b.pk).update(status="suspended")
    make_catalogue(a, status="published")
    make_catalogue(a)
    make_product(a)
    sub = Subscription.objects.get(business=a)
    Subscription.objects.filter(pk=sub.pk).update(current_period_end=timezone.now() + timedelta(days=3))

    data = client.get(f"{ADMIN}/dashboard/").json()
    assert data["businesses"]["suspended"] == 1 and data["businesses"]["total"] >= 2
    assert data["content"]["published_catalogues"] == 1 and data["content"]["catalogues"] == 2
    assert data["subscriptions"]["expiring_soon"] == 1
    assert [e["business_id"] for e in data["expiring"]] == [str(a.id)]
    assert client.get(f"{ADMIN}/dashboard/", {"from": "2026-01-10", "to": "2026-01-01"}).status_code == 400
    assert client.get(f"{ADMIN}/dashboard/", {"tz": "Mars/Base"}).status_code == 400


def test_empty_platform_dashboard(root):
    data = root[1].get(f"{ADMIN}/dashboard/").json()
    assert data["revenue"] == [] and data["recent_payments"] == []
    assert all(m["count"] == 0 for m in data["business_growth"])


# --- Businesses -------------------------------------------------------------------------------------
def test_business_list_filters_and_detail(root, make_business, make_catalogue, add_member):
    _, client = root
    a = make_business(name="Sharma Furniture")
    b = make_business(name="Gupta Textiles", subscribed=False)
    add_member(a, "staff")
    make_catalogue(a, status="published")

    assert client.get(f"{ADMIN}/businesses/", {"search": "sharma"}).json()["count"] == 1
    assert client.get(f"{ADMIN}/businesses/", {"subscription": "none"}).json()["results"][0]["id"] == str(b.id)
    row = client.get(f"{ADMIN}/businesses/", {"search": "sharma"}).json()["results"][0]
    assert row["member_count"] == 2 and row["catalogue_count"] == 1 and row["plan_name"]
    detail = client.get(f"{ADMIN}/businesses/{a.id}/").json()
    assert {m["role"] for m in detail["members"]} == {"Business Owner", "Staff"}
    assert detail["catalogues"][0]["public_url"]
    assert "password" not in str(detail)


def test_suspend_and_reactivate_are_reversible_and_audited(root, make_business, make_catalogue, client_for):
    admin, client = root
    business = make_business()
    owner = owner_of(business)
    catalogue = make_catalogue(business, status="published")
    public = f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/"
    assert APIClient().get(public).status_code == 200

    assert client.post(f"{ADMIN}/businesses/{business.id}/suspend/", {"reason": "x"}, format="json").status_code == 400
    r = client.post(f"{ADMIN}/businesses/{business.id}/suspend/", {"reason": "Fraudulent listings reported"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "suspended"
    assert client.post(f"{ADMIN}/businesses/{business.id}/suspend/", {"reason": "Again please"}, format="json").status_code == 409
    # Team access blocked, public catalogue offline, data intact, owner informed.
    assert client_for(owner, business).get("/api/v1/catalogues/").status_code == 403
    assert APIClient().get(public).status_code == 404
    assert Subscription.objects.filter(business=business, status="active").exists()
    note = Notification.objects.get(recipient=owner, event="business.suspended")
    assert note.business is None and "Fraudulent" in note.body
    entry = AuditLog.objects.get(action="business.suspended")
    assert entry.actor == admin and entry.metadata["reason"] == "Fraudulent listings reported"

    client.post(f"{ADMIN}/businesses/{business.id}/reactivate/", {"reason": "Issue resolved"}, format="json")
    assert client_for(owner, business).get("/api/v1/catalogues/").status_code == 200
    assert APIClient().get(public).status_code == 200


# --- Users ------------------------------------------------------------------------------------------
def test_user_list_detail_and_no_secrets(root, make_business):
    _, client = root
    business = make_business()
    owner = owner_of(business)
    data = client.get(f"{ADMIN}/users/", {"search": owner.email}).json()
    assert data["count"] == 1 and data["results"][0]["membership_count"] == 1
    detail = client.get(f"{ADMIN}/users/{owner.id}/").json()
    assert detail["memberships"][0]["role"] == "Business Owner" and detail["platform_role"] == ""
    assert detail["platform_permissions"] == []
    for secret in ("password", "pbkdf2", "argon2", "refresh"):
        assert secret not in str(detail).lower()


def test_deactivation_signs_user_out(root, make_business):
    _, client = root
    owner = owner_of(make_business())
    tokens = issue_tokens(owner)
    r = client.patch(f"{ADMIN}/users/{owner.id}/", {"is_active": False}, format="json")
    assert r.status_code == 200 and r.json()["is_active"] is False
    me = APIClient()
    me.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert me.get("/api/v1/auth/me/").status_code == 401
    assert APIClient().post("/api/v1/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401
    assert AuditLog.objects.filter(action="user.updated", target_id=str(owner.id)).exists()


def test_last_super_admin_and_self_protection(root, make_user):
    admin, client = root
    r = client.patch(f"{ADMIN}/users/{admin.id}/", {"platform_role": ""}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "self_change"
    other = make_user(platform_role="super_admin")
    # Two Super Admins: demoting the other is allowed…
    assert client.patch(f"{ADMIN}/users/{other.id}/", {"platform_role": "support_admin"}, format="json").status_code == 200
    # …but a Super Admin can never remove the last active one (even via another admin's account).
    from apps.platform_admin.services import update_user
    from apps.core.exceptions import BusinessRuleViolation

    with pytest.raises(BusinessRuleViolation):
        update_user(admin, actor=other, is_active=False)
    assert client.patch(f"{ADMIN}/users/{other.id}/", {"platform_role": "super_admin"}, format="json").json()["platform_role"] == "super_admin"


def test_promotion_grants_platform_permissions(root, make_user, client_for):
    _, client = root
    user = make_user()
    client.patch(f"{ADMIN}/users/{user.id}/", {"platform_role": "support_admin"}, format="json")
    me = client_for(user).get("/api/v1/auth/me/").json()
    assert "platform.support.view" in me["platform_permissions"]
    assert "platform.business.view" not in me["platform_permissions"]  # Support Admin gets no oversight


# --- Catalogues & QR ------------------------------------------------------------------------------
def test_catalogue_oversight_and_takedown(root, make_business, make_catalogue, client_for):
    _, client = root
    a, b = make_business(name="Alpha"), make_business(name="Beta")
    live = make_catalogue(a, name="Summer", status="published")
    draft = make_catalogue(b, name="Secret draft")

    data = client.get(f"{ADMIN}/catalogues/").json()
    by_name = {c["name"]: c for c in data["results"]}
    assert by_name["Summer"]["public_url"] and by_name["Secret draft"]["public_url"] is None
    assert client.get(f"{ADMIN}/catalogues/", {"business": str(b.id)}).json()["count"] == 1
    assert client.get(f"{ADMIN}/catalogues/{draft.id}/qr/").status_code == 404
    png = client.get(f"{ADMIN}/catalogues/{live.id}/qr/")
    assert png.status_code == 200 and png.content[:4] == b"\x89PNG"

    r = client.post(f"{ADMIN}/catalogues/{live.id}/unpublish/", {"reason": "Copyright complaint"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "draft"
    assert client.post(f"{ADMIN}/catalogues/{live.id}/unpublish/", {"reason": "Copyright complaint"}, format="json").status_code == 409
    assert Notification.objects.filter(recipient=owner_of(a), event="catalogue.taken_down").exists()
    assert AuditLog.objects.filter(action="catalogue.taken_down", business=a).exists()
    # Business-side access is still isolated: Beta can't see Alpha's catalogue.
    assert client_for(owner_of(b), b).get(f"/api/v1/catalogues/{live.id}/").status_code == 404


def test_system_status_has_no_secrets(root, settings):
    data = root[1].get(f"{ADMIN}/system/").json()
    assert {c["key"] for c in data["checks"]} >= {"database", "migrations", "email", "payments"}
    text = str(data)
    assert settings.SECRET_KEY not in text
    for key in ("SECRET", "PASSWORD", "EMAIL_HOST_USER", "RAZORPAY_KEY_SECRET"):
        assert key.lower() not in text.lower()
