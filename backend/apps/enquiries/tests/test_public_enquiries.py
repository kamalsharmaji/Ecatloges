import pytest
from django.core import mail
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.billing.models import Subscription
from apps.enquiries.models import Customer, Enquiry

from .conftest import enquiry_url, submit

pytestmark = pytest.mark.django_db


def test_valid_submission_creates_enquiry_and_customer(storefront, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        response = submit(storefront)
    assert response.status_code == 201, response.content
    assert set(response.json()) == {"status", "reference"}  # no personal data echoed back
    enquiry = Enquiry.objects.get()
    assert enquiry.business == storefront["business"] and enquiry.product == storefront["live"]
    assert enquiry.phone == "+919827165432" and enquiry.email == "amit@example.com"
    assert enquiry.product_name == "Wooden Chair" and enquiry.catalogue_name == "Furniture"
    assert enquiry.status == "new" and enquiry.source == "catalogue" and enquiry.quantity == 5
    customer = enquiry.customer
    assert customer.name == "Amit Patel" and customer.last_enquiry_at == enquiry.created_at
    # The business is notified by email.
    assert len(mail.outbox) == 1 and "Amit Patel" in mail.outbox[0].body
    assert mail.outbox[0].to == [storefront["business"].email]


def test_catalogue_level_enquiry_without_product(storefront):
    assert submit(storefront, product_id=None, quantity=None).status_code == 201
    assert Enquiry.objects.get().product is None


def test_idempotency_key_prevents_duplicates(storefront):
    first = submit(storefront, idempotency_key="form-1234-abcd")
    again = submit(storefront, idempotency_key="form-1234-abcd")
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["reference"] == again.json()["reference"]
    assert Enquiry.objects.count() == 1


def test_identical_resubmission_within_window_is_deduplicated(storefront):
    submit(storefront)
    assert submit(storefront, phone="+91-98271-65432").status_code == 200
    assert Enquiry.objects.count() == 1
    assert submit(storefront, message="A different question").status_code == 201
    assert Enquiry.objects.count() == 2


@pytest.mark.parametrize("spam", [{"website": "http://spam.example"}, {"elapsed_ms": 300}])
def test_spam_is_silently_dropped(storefront, spam):
    response = submit(storefront, **spam)
    assert response.status_code == 201  # bots get no signal
    assert not Enquiry.objects.exists() and not Customer.objects.exists()


@pytest.mark.parametrize(
    ("override", "field"),
    [({"phone": "12"}, "phone"), ({"phone": "call me"}, "phone"), ({"message": " "}, "message"),
     ({"email": "not-an-email"}, "email"), ({"name": "A"}, "name"), ({"quantity": 0}, "quantity")],
)
def test_validation(storefront, override, field):
    response = submit(storefront, **override)
    assert response.status_code == 400 and field in response.json()["error"]["details"]
    assert not Enquiry.objects.exists()


def test_draft_or_foreign_product_rejected(storefront, make_business, make_product):
    assert submit(storefront, product_id=str(storefront["draft"].id)).status_code == 400
    other = make_product(make_business(), status="published")
    assert submit(storefront, product_id=str(other.id)).status_code == 400
    assert not Enquiry.objects.exists()


@pytest.mark.parametrize("change", ["draft", "no_subscription", "disabled"])
def test_unavailable_catalogue(storefront, change):
    catalogue = storefront["catalogue"]
    if change == "draft":
        catalogue.status = "draft"
        catalogue.save()
        expected = 404
    elif change == "no_subscription":
        Subscription.objects.filter(business=storefront["business"]).update(status="expired")
        expected = 404
    else:
        catalogue.enquiries_enabled = False
        catalogue.save()
        expected = 403
    assert submit(storefront).status_code == expected
    assert not Enquiry.objects.exists()


def test_customer_matching_by_phone_then_email(storefront):
    submit(storefront, name="Amit Patel", phone="+91 98271 65432", email="")
    submit(storefront, name="Someone Else", phone="+919827165432", email="amit@example.com", message="Second")
    assert Customer.objects.count() == 1
    customer = Customer.objects.get()
    assert customer.name == "Amit Patel"  # public input never overwrites an existing customer's name
    assert customer.email == "amit@example.com"  # empty field filled
    # Email match with a new phone number reuses the same customer.
    submit(storefront, phone="+44 7700 900123", email="AMIT@example.com", message="Third")
    assert Customer.objects.count() == 1 and customer.enquiries.count() == 3
    # Snapshots keep what was actually submitted.
    assert set(Enquiry.objects.values_list("name", flat=True)) == {"Amit Patel", "Someone Else"}


def test_public_cannot_list_or_read_enquiries(storefront):
    submit(storefront)
    api = APIClient()
    assert api.get("/api/v1/enquiries/").status_code == 401
    assert api.get(f"/api/v1/enquiries/{Enquiry.objects.get().id}/").status_code == 401
    assert api.get(enquiry_url(storefront["business"], storefront["catalogue"])).status_code == 405


def test_public_submissions_are_rate_limited(storefront, monkeypatch):
    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "public_enquiry": "2/min"}
    )
    assert submit(storefront, message="one").status_code == 201
    assert submit(storefront, message="two").status_code == 201
    blocked = submit(storefront, message="three")
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "throttled"
    assert Enquiry.objects.count() == 2
