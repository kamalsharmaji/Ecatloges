"""Checkout, verified activation, webhook security, idempotency and reconciliation."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.billing.models import Invoice, Payment, PaymentEvent, Subscription
from apps.billing.providers.base import ProviderEvent
from apps.billing.providers.mock import MockProvider
from apps.billing.services import sync_business

from .conftest import checkout, overview, send_webhook

pytestmark = pytest.mark.django_db
S = Subscription.Status


# --- Checkout --------------------------------------------------------------------------------
def test_checkout_requires_verified_email(shop):
    shop["owner"].is_email_verified = False
    shop["owner"].save()
    response = shop["client"].post("/api/v1/billing/checkout/", {"plan_id": str(shop["plans"]["basic"].id)})
    assert response.status_code == 403 and response.json()["error"]["code"] == "email_not_verified"
    assert not Payment.objects.exists()


def test_only_owner_can_checkout(shop, add_member, client_for):
    admin = add_member(shop["business"], "admin")
    admin.user.mark_email_verified()
    response = client_for(admin.user, shop["business"]).post(
        "/api/v1/billing/checkout/", {"plan_id": str(shop["plans"]["basic"].id)}
    )
    assert response.status_code == 403  # subscription.manage is owner-reserved


def test_checkout_creates_pending_state_without_access(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    assert payment.status == Payment.Status.CREATED and payment.is_test and payment.kind == "new"
    assert payment.subscription.status == S.PENDING_PAYMENT
    assert payment.amount == Decimal("1000.00")
    data = overview(shop["client"])
    assert data["has_paid_access"] is False and data["subscription"] is None
    assert data["open_checkout"]["id"] == str(payment.id)
    # Paid features stay locked.
    invite = shop["client"].post("/api/v1/invitations/", {"email": "a@example.com", "role_id": "x"})
    assert invite.status_code in (400, 402)


def test_no_trial_without_payment(shop):
    assert overview(shop["client"])["has_paid_access"] is False
    assert not Subscription.objects.filter(business=shop["business"]).exists()


def test_checkout_is_idempotent_and_replaceable(shop):
    first = checkout(shop["client"], shop["plans"]["basic"])
    again = checkout(shop["client"], shop["plans"]["basic"])
    assert again.id == first.id
    other = checkout(shop["client"], shop["plans"]["pro"])
    first.refresh_from_db()
    assert other.id != first.id
    assert first.status == Payment.Status.EXPIRED and first.failure_code == "checkout_replaced"
    assert first.subscription.status == S.ABANDONED and first.subscription.abandoned_reason == "replaced"
    assert Payment.objects.filter(business=shop["business"], status="created").count() == 1


def test_inactive_plan_cannot_be_bought(shop):
    plan = shop["plans"]["basic"]
    plan.is_active = False
    plan.save()
    response = shop["client"].post("/api/v1/billing/checkout/", {"plan_id": str(plan.id)})
    assert response.status_code == 409 and response.json()["error"]["code"] == "plan_unavailable"


@override_settings(PAYMENT_PROVIDER="")
def test_checkout_without_configured_provider(shop):
    response = shop["client"].post("/api/v1/billing/checkout/", {"plan_id": str(shop["plans"]["basic"].id)})
    assert response.status_code == 503 and response.json()["error"]["code"] == "payment_provider_unavailable"
    assert not Payment.objects.exists()


# --- Verified activation ---------------------------------------------------------------------
def test_verified_webhook_activates_and_issues_invoice(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    response = send_webhook(payment)
    assert response.status_code == 200 and response.json() == {"status": "processed"}
    payment.refresh_from_db()
    sub = payment.subscription
    sub.refresh_from_db()
    assert payment.status == "captured" and payment.applied_at and payment.provider_payment_id
    assert sub.status == S.ACTIVE and sub.current_period_end > timezone.now() + timedelta(days=29)
    invoice = Invoice.objects.get(payment=payment)
    assert invoice.number.startswith("TEST-") and invoice.is_test and invoice.total == payment.amount
    assert overview(shop["client"])["has_paid_access"] is True


def test_forged_or_missing_signature_is_rejected(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    forged = send_webhook(payment, secret="attacker-guess")
    assert forged.status_code == 400 and forged.json()["error"]["code"] == "invalid_signature"
    missing = send_webhook(payment, signature="")
    assert missing.status_code == 400
    payment.refresh_from_db()
    assert payment.status == "created" and payment.subscription.status == S.PENDING_PAYMENT
    assert not PaymentEvent.objects.exists()


def test_duplicate_webhooks_are_idempotent(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    assert send_webhook(payment, event_id="evt_1", payment_id="pay_1").json()["status"] == "processed"
    assert send_webhook(payment, event_id="evt_1", payment_id="pay_1").json()["status"] == "duplicate"
    # Same capture re-delivered under a new event id: recorded, but nothing changes.
    assert send_webhook(payment, event_id="evt_2", payment_id="pay_1").json()["status"] == "ignored"
    assert Invoice.objects.count() == 1
    assert Subscription.objects.filter(business=shop["business"], status=S.ACTIVE).count() == 1


def test_second_capture_on_same_order_is_flagged(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment, payment_id="pay_1")
    send_webhook(payment, payment_id="pay_2")
    payment.refresh_from_db()
    assert payment.requires_attention and "refund" in payment.attention_reason
    assert Invoice.objects.count() == 1


def test_failed_then_successful_retry(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment, "failed")
    payment.refresh_from_db()
    assert payment.status == "failed" and payment.failure_code == "card_declined"
    assert payment.subscription.status == S.PENDING_PAYMENT
    send_webhook(payment, "captured")
    payment.refresh_from_db()
    assert payment.status == "captured" and payment.subscription.status == S.ACTIVE


def test_out_of_order_failure_after_capture_is_ignored(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment, "captured")
    assert send_webhook(payment, "failed").json()["status"] == "ignored"
    payment.refresh_from_db()
    assert payment.status == "captured" and payment.subscription.status == S.ACTIVE


@pytest.mark.parametrize(("amount_delta", "currency"), [(-100, None), (100, None), (0, "USD")])
def test_amount_or_currency_mismatch_never_activates(shop, amount_delta, currency):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment, amount_minor=100000 + amount_delta, currency=currency)
    payment.refresh_from_db()
    assert payment.status != "captured" and payment.failure_code == "amount_mismatch"
    assert payment.requires_attention
    assert payment.subscription.status == S.PENDING_PAYMENT
    assert not Invoice.objects.exists()
    # The customer-facing API never exposes the internal review note.
    body = shop["client"].get(f"/api/v1/billing/payments/{payment.id}/").json()
    assert body["under_review"] is True and "attention_reason" not in body


def test_unknown_order_is_acknowledged_but_ignored(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    payment.provider_order_id = "mock_order_someone_else"
    response = send_webhook(payment)
    assert response.status_code == 200 and response.json()["status"] == "ignored"


def test_late_capture_after_checkout_expiry_still_activates(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    Payment.objects.filter(pk=payment.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
    sync_business(shop["business"].pk)
    payment.refresh_from_db()
    assert payment.status == "expired" and payment.subscription.status == S.ABANDONED
    send_webhook(payment)
    payment.refresh_from_db()
    assert payment.status == "captured" and payment.subscription.status == S.ACTIVE


def test_capture_for_replaced_checkout_needs_review(shop):
    old = checkout(shop["client"], shop["plans"]["basic"])
    new = checkout(shop["client"], shop["plans"]["pro"])
    send_webhook(old)
    old.refresh_from_db()
    new.refresh_from_db()
    assert old.status == "captured" and old.requires_attention and not old.applied_at
    assert not Subscription.objects.filter(business=shop["business"], status=S.ACTIVE).exists()
    assert new.status == "created"  # the customer's current checkout is untouched
    # Paying the current checkout still works and yields exactly one active subscription.
    send_webhook(new)
    assert Subscription.objects.filter(business=shop["business"], status=S.ACTIVE).count() == 1


def test_frontend_cannot_activate_without_verified_payment(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    client = shop["client"]
    # A fake "I paid" confirmation fails signature verification.
    confirm = client.post(f"/api/v1/billing/payments/{payment.id}/confirm/", {"status": "captured"})
    assert confirm.status_code == 400 and confirm.json()["error"]["code"] == "invalid_signature"
    # Reconciling with a gateway that has no payment attempts changes nothing.
    assert client.post(f"/api/v1/billing/payments/{payment.id}/refresh/").json()["status"] == "created"
    assert overview(client)["has_paid_access"] is False


def test_reconciliation_recovers_missed_webhook(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    MockProvider.record_gateway_event(
        ProviderEvent(event_id=f"rec_{payment.id}", event_type="reconcile", order_id=payment.provider_order_id,
                      payment_id="pay_rec", status="captured", amount_minor=100000, currency="INR")
    )
    body = shop["client"].post(f"/api/v1/billing/payments/{payment.id}/refresh/").json()
    assert body["status"] == "captured" and body["invoice_id"]
    assert overview(shop["client"])["has_paid_access"] is True


def test_dev_simulator_uses_signed_webhook_path(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    body = shop["client"].post(f"/api/v1/billing/payments/{payment.id}/simulate/", {"outcome": "captured"}).json()
    assert body["status"] == "captured"
    assert PaymentEvent.objects.filter(payment=payment, outcome="processed").exists()


def test_dev_simulator_unavailable_without_mock(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    with override_settings(PAYMENT_MOCK_ENABLED=False):
        response = shop["client"].post(f"/api/v1/billing/payments/{payment.id}/simulate/", {"outcome": "captured"})
        assert response.status_code == 404
        assert send_webhook(payment).status_code == 503  # mock gateway endpoint no longer exists
    payment.refresh_from_db()
    assert payment.status == "created"


def test_cancel_open_checkout(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    response = shop["client"].post(f"/api/v1/billing/payments/{payment.id}/cancel/")
    assert response.status_code == 200 and response.json()["status"] == "expired"
    payment.subscription.refresh_from_db()
    assert payment.subscription.status == S.ABANDONED
