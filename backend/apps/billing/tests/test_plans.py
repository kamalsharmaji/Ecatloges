import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings

from apps.accounts.models import PlatformRole
from apps.billing.models import Plan
from conftest import activate_subscription, owner_of

pytestmark = pytest.mark.django_db

PUBLIC = "/api/v1/billing/plans/"
ADMIN = "/api/v1/admin/plans/"


@pytest.fixture
def super_admin(make_user):
    return make_user(platform_role=PlatformRole.SUPER_ADMIN)


@pytest.fixture
def support_admin(make_user):
    return make_user(platform_role=PlatformRole.SUPPORT_ADMIN)


def plan_payload(**overrides):
    data = {
        "code": "growth-monthly",
        "name": "Growth",
        "description": "",
        "price": "1499.00",
        "currency": "INR",
        "interval": "month",
        "tier_rank": 2,
        "max_catalogues": 5,
        "max_products": None,
        "max_staff": 5,
        "storage_limit_mb": 2048,
        "video_uploads_enabled": True,
        "max_video_size_mb": 100,
        "is_active": True,
        "is_public": True,
    }
    data.update(overrides)
    return data


def test_public_list_shows_only_active_public_plans(api, make_plan):
    visible = make_plan(code="visible")
    make_plan(code="inactive", is_active=False)
    make_plan(code="hidden", is_public=False)
    make_plan(code="usd", currency="USD")  # not in BILLING_CURRENCIES
    codes = {p["code"] for p in api.get(PUBLIC).json()}
    assert codes == {visible.code}


def test_public_list_filters_by_interval(api, make_plan):
    make_plan(code="m", interval="month")
    make_plan(code="y", interval="year")
    assert [p["code"] for p in api.get(PUBLIC, {"interval": "year"}).json()] == ["y"]


def test_dev_seed_plans_hidden_without_mock_provider(api, make_plan):
    make_plan(code="dev-x", is_development_seed=True)
    assert [p["code"] for p in api.get(PUBLIC).json()] == ["dev-x"]
    with override_settings(PAYMENT_MOCK_ENABLED=False):
        assert api.get(PUBLIC).json() == []


def test_super_admin_crud(client_for, super_admin):
    client = client_for(super_admin)
    created = client.post(ADMIN, plan_payload(), format="json")
    assert created.status_code == 201, created.content
    plan_id = created.json()["id"]
    updated = client.patch(f"{ADMIN}{plan_id}/", {"price": "1599.00", "is_public": False}, format="json")
    assert updated.status_code == 200 and updated.json()["price"] == "1599.00"
    assert client.get(ADMIN).json()["count"] == 1
    assert client.delete(f"{ADMIN}{plan_id}/").status_code == 204


def test_plan_validation(client_for, super_admin):
    client = client_for(super_admin)
    bad_currency = client.post(ADMIN, plan_payload(currency="EUR"), format="json")
    assert bad_currency.status_code == 400 and "currency" in bad_currency.json()["error"]["details"]
    bad_price = client.post(ADMIN, plan_payload(price="-1"), format="json")
    assert bad_price.status_code == 400 and "price" in bad_price.json()["error"]["details"]
    bad_video = client.post(ADMIN, plan_payload(video_uploads_enabled=False, max_video_size_mb=10), format="json")
    assert bad_video.status_code == 400


def test_plan_in_use_cannot_be_deleted(client_for, super_admin, make_business, make_plan):
    plan = make_plan()
    activate_subscription(make_business(subscribed=False), plan)
    response = client_for(super_admin).delete(f"{ADMIN}{plan.id}/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "plan_in_use"
    assert Plan.objects.filter(pk=plan.pk).exists()


def test_support_admin_can_view_but_not_manage(client_for, support_admin, make_plan):
    plan = make_plan()
    client = client_for(support_admin)
    assert client.get(ADMIN).status_code == 200
    assert client.post(ADMIN, plan_payload(), format="json").status_code == 403
    assert client.patch(f"{ADMIN}{plan.id}/", {"price": "1.00"}, format="json").status_code == 403
    assert client.delete(f"{ADMIN}{plan.id}/").status_code == 403


def test_business_owner_and_anonymous_cannot_use_admin_api(api, client_for, make_business):
    business = make_business()
    owner_client = client_for(owner_of(business), business)
    for url in (ADMIN, "/api/v1/admin/subscriptions/", "/api/v1/admin/payments/", "/api/v1/admin/invoices/"):
        assert owner_client.get(url).status_code == 403
        assert api.get(url).status_code == 401
    assert owner_client.post(ADMIN, plan_payload(), format="json").status_code == 403


def test_seed_dev_plans_marks_placeholders():
    call_command("seed_dev_plans")
    plans = Plan.objects.all()
    assert plans.count() == 6
    assert all(p.is_development_seed and p.name.startswith("[DEV]") and "NOT approved" in p.description for p in plans)
    call_command("seed_dev_plans")  # idempotent
    assert Plan.objects.count() == 6


@override_settings(PAYMENT_MOCK_ENABLED=False)
def test_seed_dev_plans_refuses_without_mock():
    with pytest.raises(CommandError):
        call_command("seed_dev_plans")
    assert not Plan.objects.exists()
