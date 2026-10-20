import pytest
from rest_framework.test import APIClient

from apps.billing.models import Payment
from apps.billing.money import to_minor
from apps.billing.providers import mock
from conftest import owner_of

WEBHOOK = "/api/v1/billing/webhooks/mock/"


def send_webhook(payment: Payment, status="captured", *, amount_minor=None, currency=None, event_id=None,
                 payment_id=None, secret=None, signature=None):
    """Deliver a mock-gateway webhook exactly as the gateway would (raw body + HMAC header)."""
    body = mock.build_event_body(
        order_id=payment.provider_order_id,
        status=status,
        amount_minor=to_minor(payment.amount) if amount_minor is None else amount_minor,
        currency=currency or payment.currency,
        event_id=event_id,
        payment_id=payment_id,
        failure_code="card_declined" if status == "failed" else "",
    )
    headers = {}
    sig = signature if signature is not None else mock.sign(body, secret)
    if sig:
        headers["HTTP_X_MOCK_SIGNATURE"] = sig
    return APIClient().post(WEBHOOK, data=body, content_type="application/json", **headers)


@pytest.fixture
def shop(make_business, make_plan, client_for):
    """A freshly onboarded business with a verified owner and NO subscription yet."""
    business = make_business(subscribed=False)
    owner = owner_of(business)
    owner.mark_email_verified()
    plans = {
        "basic": make_plan(code="basic-m", name="Basic", price="1000.00", tier_rank=1, max_staff=3),
        "pro": make_plan(code="pro-m", name="Pro", price="2500.00", tier_rank=2, max_staff=10),
        "basic_year": make_plan(code="basic-y", name="Basic", price="10000.00", interval="year", tier_rank=1, max_staff=3),
    }
    return {"business": business, "owner": owner, "client": client_for(owner, business), "plans": plans}


def checkout(client, plan):
    response = client.post("/api/v1/billing/checkout/", {"plan_id": str(plan.id)})
    assert response.status_code == 201, response.content
    return Payment.objects.get(pk=response.json()["id"])


def overview(client):
    response = client.get("/api/v1/billing/subscription/")
    assert response.status_code == 200, response.content
    return response.json()
