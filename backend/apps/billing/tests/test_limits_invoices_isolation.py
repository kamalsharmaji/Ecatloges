from decimal import Decimal

import pytest
from django.test import override_settings

from apps.billing import entitlements
from apps.billing.models import Invoice, Payment, Subscription
from apps.billing.money import compute_tax
from conftest import activate_subscription, owner_of, system_role

from .conftest import checkout, send_webhook

pytestmark = pytest.mark.django_db


def invite(client, email):
    return client.post("/api/v1/invitations/", {"email": email, "role_id": str(system_role("staff").id)})


# --- Plan limits & access ------------------------------------------------------------------
def test_staff_seat_limit_counts_members_and_pending_invites(make_business, make_plan, client_for):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_staff=2))  # owner + 1
    client = client_for(owner_of(business), business)
    assert invite(client, "one@example.com").status_code == 201
    blocked = invite(client, "two@example.com")
    assert blocked.status_code == 402 and blocked.json()["error"]["code"] == "plan_limit_exceeded"


def test_restoring_suspended_member_respects_seat_limit(make_business, make_plan, add_member, client_for):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_staff=2))
    suspended = add_member(business, "staff", status="suspended")
    client = client_for(owner_of(business), business)
    assert invite(client, "fill@example.com").status_code == 201  # takes the last seat
    response = client.patch(f"/api/v1/members/{suspended.id}/", {"status": "active"})
    assert response.status_code == 402


def test_unlimited_seats_when_limit_is_null(make_business, make_plan, client_for):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_staff=None))
    client = client_for(owner_of(business), business)
    for i in range(5):
        assert invite(client, f"u{i}@example.com").status_code == 201


def test_paid_features_require_subscription(make_business, client_for):
    business = make_business(subscribed=False)
    response = invite(client_for(owner_of(business), business), "x@example.com")
    assert response.status_code == 402 and response.json()["error"]["code"] == "subscription_required"


def test_feature_flags_follow_snapshot(make_business, make_plan):
    business = make_business(subscribed=False)
    plan = make_plan(custom_branding=True)
    activate_subscription(business, plan)
    assert entitlements.feature_enabled(business, "custom_branding")
    assert not entitlements.feature_enabled(business, "analytics_enabled")


# --- Invoices & money ----------------------------------------------------------------------
def test_compute_tax_modes():
    assert compute_tax(Decimal("1000"), rate_percent=Decimal("0"), inclusive=False) == {
        "subtotal": Decimal("1000.00"), "tax_amount": Decimal("0.00"), "total": Decimal("1000.00"),
    }
    assert compute_tax(Decimal("1000"), rate_percent=Decimal("18"), inclusive=False) == {
        "subtotal": Decimal("1000.00"), "tax_amount": Decimal("180.00"), "total": Decimal("1180.00"),
    }
    assert compute_tax(Decimal("1180"), rate_percent=Decimal("18"), inclusive=True) == {
        "subtotal": Decimal("1000.00"), "tax_amount": Decimal("180.00"), "total": Decimal("1180.00"),
    }


@override_settings(BILLING_TAX_RATE="12.5", BILLING_TAX_NAME="Example tax", BILLING_PRICES_INCLUDE_TAX=False)
def test_exclusive_tax_is_charged_and_invoiced(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    assert (payment.subtotal, payment.tax_amount, payment.amount) == (Decimal("1000.00"), Decimal("125.00"), Decimal("1125.00"))
    # The gateway must report the tax-inclusive amount; the plan price alone is a mismatch.
    send_webhook(payment, amount_minor=100000)
    assert not Invoice.objects.exists()
    send_webhook(payment, amount_minor=112500)
    invoice = Invoice.objects.get(payment=payment)
    assert (invoice.subtotal, invoice.tax_amount, invoice.total) == (Decimal("1000.00"), Decimal("125.00"), Decimal("1125.00"))
    assert invoice.tax_name == "Example tax" and invoice.tax_rate == Decimal("12.50")


def test_no_tax_by_default(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment)
    invoice = Invoice.objects.get(payment=payment)
    assert invoice.tax_rate == 0 and invoice.tax_amount == 0 and invoice.tax_name == ""


def test_invoice_numbers_are_sequential_and_snapshot_parties(shop):
    first = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(first)
    second = checkout(shop["client"], shop["plans"]["pro"])
    send_webhook(second)
    numbers = sorted(Invoice.objects.values_list("number", flat=True))
    assert numbers[0].endswith("000001") and numbers[1].endswith("000002")
    invoice = Invoice.objects.get(payment=first)
    business = shop["business"]
    business.name = "Renamed Co"
    business.save()
    invoice.refresh_from_db()
    assert invoice.buyer["name"] != "Renamed Co"


def test_invoice_api_and_pdf(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment)
    listing = shop["client"].get("/api/v1/billing/invoices/").json()
    assert listing["count"] == 1
    invoice_id = listing["results"][0]["id"]
    detail = shop["client"].get(f"/api/v1/billing/invoices/{invoice_id}/").json()
    assert detail["total"] == "1000.00" and len(detail["lines"]) == 1
    pdf = shop["client"].get(f"/api/v1/billing/invoices/{invoice_id}/pdf/")
    assert pdf.status_code == 200 and pdf["Content-Type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")


# --- Billing RBAC & cross-business isolation -----------------------------------------------
@pytest.fixture
def two_billed_businesses(make_business, make_plan, client_for):
    from .conftest import checkout as do_checkout

    out = {}
    for key in ("a", "b"):
        business = make_business(subscribed=False)
        owner = owner_of(business)
        owner.mark_email_verified()
        client = client_for(owner, business)
        payment = do_checkout(client, make_plan(price="500.00"))
        send_webhook(payment)
        out[key] = {"business": business, "client": client, "payment": payment,
                    "invoice": Invoice.objects.get(payment=payment),
                    "subscription": Subscription.objects.get(business=business)}
    return out


def test_other_business_billing_records_are_invisible(two_billed_businesses):
    a, b = two_billed_businesses["a"], two_billed_businesses["b"]
    client = a["client"]
    for url in (
        f"/api/v1/billing/payments/{b['payment'].id}/",
        f"/api/v1/billing/invoices/{b['invoice'].id}/",
        f"/api/v1/billing/invoices/{b['invoice'].id}/pdf/",
    ):
        assert client.get(url).status_code == 404
    for url in ("refresh", "cancel", "confirm", "simulate"):
        response = client.post(f"/api/v1/billing/payments/{b['payment'].id}/{url}/", {"outcome": "captured"})
        assert response.status_code == 404
    assert [p["id"] for p in client.get("/api/v1/billing/payments/").json()["results"]] == [str(a["payment"].id)]
    assert [i["id"] for i in client.get("/api/v1/billing/invoices/").json()["results"]] == [str(a["invoice"].id)]
    history = client.get("/api/v1/billing/subscriptions/").json()["results"]
    assert {s["id"] for s in history} == {str(a["subscription"].id)}
    assert client.get("/api/v1/billing/subscription/").json()["subscription"]["id"] == str(a["subscription"].id)


def test_header_for_foreign_business_is_404_for_billing(two_billed_businesses, client_for):
    a, b = two_billed_businesses["a"], two_billed_businesses["b"]
    intruder = client_for(owner_of(a["business"]), b["business"])
    for url in ("/api/v1/billing/subscription/", "/api/v1/billing/payments/", "/api/v1/billing/invoices/"):
        assert intruder.get(url).status_code == 404
    response = intruder.post("/api/v1/billing/subscription/cancel/")
    assert response.status_code == 404
    b["subscription"].refresh_from_db()
    assert b["subscription"].cancel_at_period_end is False


def test_billing_permissions_by_role(make_business, add_member, client_for):
    business = make_business()
    viewer = client_for(add_member(business, "viewer").user, business)
    staff = client_for(add_member(business, "staff").user, business)
    admin_member = add_member(business, "admin")
    admin_member.user.mark_email_verified()
    admin = client_for(admin_member.user, business)
    assert viewer.get("/api/v1/billing/subscription/").status_code == 200
    assert viewer.get("/api/v1/billing/invoices/").status_code == 200
    assert viewer.post("/api/v1/billing/subscription/cancel/").status_code == 403
    assert staff.get("/api/v1/billing/subscription/").status_code == 403
    assert staff.get("/api/v1/billing/payments/").status_code == 403
    assert admin.get("/api/v1/billing/payments/").status_code == 200
    assert admin.post("/api/v1/billing/subscription/cancel/").status_code == 403  # owner-reserved


def test_platform_admin_sees_all_billing(two_billed_businesses, make_user, client_for):
    from apps.accounts.models import PlatformRole

    support = client_for(make_user(platform_role=PlatformRole.SUPPORT_ADMIN))
    assert support.get("/api/v1/admin/payments/").json()["count"] == 2
    assert support.get("/api/v1/admin/subscriptions/").json()["count"] == 2
    assert support.get("/api/v1/admin/invoices/").json()["count"] == 2
    payment = two_billed_businesses["a"]["payment"]
    detail = support.get(f"/api/v1/admin/payments/{payment.id}/").json()
    assert detail["events"] and "attention_reason" in detail
    # Support can look but not act.
    assert support.post(f"/api/v1/admin/payments/{payment.id}/reconcile/").status_code == 403
    sub = two_billed_businesses["a"]["subscription"]
    assert support.post(f"/api/v1/admin/subscriptions/{sub.id}/cancel/").status_code == 403

    root = client_for(make_user(platform_role=PlatformRole.SUPER_ADMIN))
    assert root.post(f"/api/v1/admin/payments/{payment.id}/reconcile/").status_code == 200
    response = root.post(f"/api/v1/admin/subscriptions/{sub.id}/cancel/", {"immediately": True})
    assert response.status_code == 200 and response.json()["status"] == "cancelled"


def test_events_store_only_sanitised_summaries(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment)
    event = Payment.objects.get(pk=payment.pk).events.get()
    assert set(event.summary) == {"type", "order_id", "payment_id", "status", "amount_minor", "currency", "failure_code"}
