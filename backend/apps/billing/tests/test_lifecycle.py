"""Renewals, upgrades, scheduled downgrades, cancellation, expiry and historical snapshots."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.billing.models import Invoice, Payment, Subscription
from apps.billing.services import sync_business

from .conftest import checkout, overview, send_webhook

pytestmark = pytest.mark.django_db
S = Subscription.Status


def subscribe(shop, plan_key="basic") -> Subscription:
    payment = checkout(shop["client"], shop["plans"][plan_key])
    send_webhook(payment)
    return Subscription.objects.get(business=shop["business"], status=S.ACTIVE)


def end_period_in(sub: Subscription, delta: timedelta) -> None:
    Subscription.objects.filter(pk=sub.pk).update(current_period_end=timezone.now() + delta)
    sub.refresh_from_db()


def quote(shop, plan):
    return shop["client"].get("/api/v1/billing/checkout/quote/", {"plan_id": str(plan.id)}).json()


# --- Renewal ---------------------------------------------------------------------------------
def test_renewal_extends_from_period_end(shop):
    sub = subscribe(shop)
    end_period_in(sub, timedelta(days=5))
    old_end = sub.current_period_end
    q = quote(shop, shop["plans"]["basic"])
    assert q["kind"] == "renewal" and q["can_checkout"]
    payment = checkout(shop["client"], shop["plans"]["basic"])
    assert payment.subscription_id == sub.id  # renewals extend the same subscription
    send_webhook(payment)
    sub.refresh_from_db()
    assert sub.status == S.ACTIVE and sub.current_period_end == old_end + timedelta(days=30)
    invoice = Invoice.objects.get(payment=payment)
    assert invoice.period_start == old_end


@override_settings(RENEWAL_WINDOW_DAYS=7)
def test_renewal_not_due_yet(shop):
    subscribe(shop)
    q = quote(shop, shop["plans"]["basic"])
    assert not q["can_checkout"] and q["blockers"][0]["code"] == "renewal_not_due"
    response = shop["client"].post("/api/v1/billing/checkout/", {"plan_id": str(shop["plans"]["basic"].id)})
    assert response.status_code == 409 and response.json()["error"]["code"] == "renewal_not_due"


def test_renewal_keeps_purchase_time_price(shop):
    sub = subscribe(shop)
    plan = shop["plans"]["basic"]
    plan.price = Decimal("1999.00")  # price rise after purchase
    plan.save()
    end_period_in(sub, timedelta(days=2))
    payment = checkout(shop["client"], plan)
    assert payment.kind == "renewal" and payment.amount == Decimal("1000.00")
    sub.refresh_from_db()
    assert sub.plan_price == Decimal("1000.00")


def test_price_change_never_rewrites_history(shop):
    sub = subscribe(shop)
    invoice = Invoice.objects.get(subscription=sub)
    plan = shop["plans"]["basic"]
    plan.price = Decimal("5.00")
    plan.max_staff = 1
    plan.save()
    sub.refresh_from_db()
    invoice.refresh_from_db()
    assert sub.plan_price == Decimal("1000.00") and sub.limits["max_staff"] == 3
    assert invoice.total == Decimal("1000.00") and invoice.lines.get().amount == Decimal("1000.00")


# --- Upgrade / downgrade ---------------------------------------------------------------------
def test_upgrade_is_immediate_and_supersedes(shop):
    old = subscribe(shop, "basic")
    q = quote(shop, shop["plans"]["pro"])
    assert q["kind"] == "plan_change" and q["can_checkout"]
    payment = checkout(shop["client"], shop["plans"]["pro"])
    old.refresh_from_db()
    assert old.status == S.ACTIVE  # nothing changes before payment
    send_webhook(payment)
    old.refresh_from_db()
    new = payment.subscription
    new.refresh_from_db()
    assert old.status == S.SUPERSEDED and new.status == S.ACTIVE and new.plan_code == "pro-m"
    assert Subscription.objects.filter(business=shop["business"], status=S.ACTIVE).count() == 1


def test_monthly_to_yearly_same_tier_is_an_upgrade(shop):
    subscribe(shop, "basic")
    assert quote(shop, shop["plans"]["basic_year"])["kind"] == "plan_change"


def test_downgrade_must_be_scheduled_then_applies_at_period_end(shop):
    current = subscribe(shop, "pro")
    basic = shop["plans"]["basic"]
    direct = shop["client"].post("/api/v1/billing/checkout/", {"plan_id": str(basic.id)})
    assert direct.status_code == 409 and direct.json()["error"]["code"] == "downgrade_must_be_scheduled"

    scheduled = shop["client"].post("/api/v1/billing/subscription/schedule-downgrade/", {"plan_id": str(basic.id)})
    assert scheduled.status_code == 200 and scheduled.json()["pending_plan"]["id"] == str(basic.id)

    end_period_in(current, timedelta(days=3))
    q = quote(shop, basic)
    assert q["kind"] == "scheduled_change" and q["can_checkout"]
    payment = checkout(shop["client"], basic)
    send_webhook(payment)
    nxt = payment.subscription
    nxt.refresh_from_db()
    current.refresh_from_db()
    assert nxt.status == S.SCHEDULED and nxt.starts_at == current.current_period_end
    assert current.status == S.ACTIVE and current.pending_plan_id is None

    # Period ends → the scheduled plan takes over.
    sync_business(shop["business"].pk, now=current.current_period_end + timedelta(seconds=1))
    current.refresh_from_db()
    nxt.refresh_from_db()
    assert current.status == S.SUPERSEDED and nxt.status == S.ACTIVE


def test_downgrade_blocked_when_usage_exceeds_target(shop, add_member, make_plan):
    subscribe(shop, "pro")
    tiny = make_plan(code="tiny", tier_rank=0, max_staff=1)
    add_member(shop["business"], "staff")
    response = shop["client"].post("/api/v1/billing/subscription/schedule-downgrade/", {"plan_id": str(tiny.id)})
    assert response.status_code == 409 and response.json()["error"]["code"] == "usage_exceeds_plan"


def test_schedule_downgrade_rejects_upgrades(shop):
    subscribe(shop, "basic")
    response = shop["client"].post(
        "/api/v1/billing/subscription/schedule-downgrade/", {"plan_id": str(shop["plans"]["pro"].id)}
    )
    assert response.status_code == 409 and response.json()["error"]["code"] == "upgrade_requires_checkout"


# --- Cancellation & expiry -------------------------------------------------------------------
def test_cancel_keeps_access_until_period_end_then_ends(shop):
    sub = subscribe(shop)
    response = shop["client"].post("/api/v1/billing/subscription/cancel/")
    assert response.status_code == 200 and response.json()["cancel_at_period_end"] is True
    assert overview(shop["client"])["has_paid_access"] is True
    sync_business(shop["business"].pk, now=sub.current_period_end + timedelta(seconds=1))
    sub.refresh_from_db()
    assert sub.status == S.CANCELLED
    assert overview(shop["client"])["has_paid_access"] is False


def test_resume_before_period_end(shop):
    subscribe(shop)
    shop["client"].post("/api/v1/billing/subscription/cancel/")
    response = shop["client"].post("/api/v1/billing/subscription/resume/")
    assert response.status_code == 200 and response.json()["cancel_at_period_end"] is False


def test_unpaid_period_end_expires_without_grace(shop):
    sub = subscribe(shop)
    end_period_in(sub, timedelta(seconds=-1))
    assert overview(shop["client"])["has_paid_access"] is False
    sub.refresh_from_db()
    assert sub.status == S.EXPIRED


@override_settings(SUBSCRIPTION_GRACE_DAYS=3)
def test_grace_period_then_expiry(shop):
    sub = subscribe(shop)
    end_period_in(sub, timedelta(seconds=-1))
    data = overview(shop["client"])
    assert data["has_paid_access"] is True and data["subscription"]["status"] == "past_due"
    # Renewing while past due restarts the period from now.
    payment = checkout(shop["client"], shop["plans"]["basic"])
    assert payment.kind == "renewal"
    send_webhook(payment)
    sub.refresh_from_db()
    assert sub.status == S.ACTIVE and sub.current_period_end > timezone.now() + timedelta(days=29)


@override_settings(SUBSCRIPTION_GRACE_DAYS=3)
def test_past_due_expires_after_grace(shop):
    sub = subscribe(shop)
    end_period_in(sub, timedelta(seconds=-1))
    sync_business(shop["business"].pk)
    sync_business(shop["business"].pk, now=timezone.now() + timedelta(days=3, seconds=5))
    sub.refresh_from_db()
    assert sub.status == S.EXPIRED


def test_unpaid_checkout_expires(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    sync_business(shop["business"].pk, now=payment.expires_at + timedelta(seconds=1))
    payment.refresh_from_db()
    assert payment.status == Payment.Status.EXPIRED and payment.subscription.status == S.ABANDONED


def test_history_lists_all_subscriptions(shop):
    subscribe(shop, "basic")
    send_webhook(checkout(shop["client"], shop["plans"]["pro"]))
    statuses = {row["status"] for row in shop["client"].get("/api/v1/billing/subscriptions/").json()["results"]}
    assert statuses == {"active", "superseded"}
