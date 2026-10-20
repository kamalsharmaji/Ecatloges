from datetime import timedelta

import pytest
from django.utils import timezone

from apps.enquiries.models import Customer, Enquiry
from conftest import owner_of

pytestmark = pytest.mark.django_db
ENQ = "/api/v1/enquiries/"
CUST = "/api/v1/customers/"


def make_enquiry(business, catalogue=None, customer=None, **extra):
    extra.setdefault("name", "Priya Mehta")
    extra.setdefault("phone", "+919000000001")
    extra.setdefault("message", "Interested")
    return Enquiry.objects.create(business=business, catalogue=catalogue, customer=customer,
                                  catalogue_name=catalogue.name if catalogue else "", **extra)


# --- Enquiries ------------------------------------------------------------------------------
def test_list_search_filter_and_summary(make_business, owner_client, make_catalogue):
    business = make_business()
    a, b = make_catalogue(business, name="Lamps"), make_catalogue(business, name="Sofas")
    e1 = make_enquiry(business, a, name="Amit Patel", email="amit@example.com")
    make_enquiry(business, b, name="Neha Sharma", status="closed")
    old = make_enquiry(business, a, name="Old Lead")
    Enquiry.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=40))
    client = owner_client(business)

    def names(**params):
        return [r["name"] for r in client.get(ENQ, params).json()["results"]]

    assert names(search="amit@") == ["Amit Patel"]
    assert names(status="closed") == ["Neha Sharma"]
    assert set(names(catalogue=str(a.id))) == {"Amit Patel", "Old Lead"}
    since = (timezone.now() - timedelta(days=7)).date().isoformat()
    assert "Old Lead" not in names(created_from=since)
    detail = client.get(f"{ENQ}{e1.id}/").json()
    assert detail["catalogue"] == {"id": str(a.id), "name": "Lamps"} and detail["status"] == "new"
    summary = client.get(f"{ENQ}summary/").json()
    assert summary["total"] == 3 and summary["new"] == 2 and summary["closed"] == 1 and summary["this_month"] >= 2


def test_status_lifecycle_and_notes(make_business, owner_client):
    business = make_business()
    enquiry = make_enquiry(business)
    client = owner_client(business)
    response = client.patch(f"{ENQ}{enquiry.id}/", {"status": "contacted", "internal_notes": "Called, sent price list"}, format="json")
    assert response.status_code == 200 and response.json()["internal_notes"] == "Called, sent price list"
    converted = client.patch(f"{ENQ}{enquiry.id}/", {"status": "converted"}, format="json").json()
    assert converted["converted_at"] and converted["status_changed_at"]
    client.patch(f"{ENQ}{enquiry.id}/", {"status": "closed"}, format="json")
    enquiry.refresh_from_db()
    assert enquiry.converted_at is not None  # conversion stays recorded
    # Contact snapshot and message are read-only.
    client.patch(f"{ENQ}{enquiry.id}/", {"phone": "+1", "message": "changed"}, format="json")
    enquiry.refresh_from_db()
    assert enquiry.phone == "+919000000001" and enquiry.message == "Interested"
    assert client.patch(f"{ENQ}{enquiry.id}/", {"status": "won"}, format="json").status_code == 400


def test_bulk_status_and_delete(make_business, owner_client):
    business = make_business()
    ids = [str(make_enquiry(business, phone=f"+91900000000{i}").id) for i in range(3)]
    client = owner_client(business)
    assert client.post(f"{ENQ}bulk/", {"ids": ids, "action": "set_status", "status": "in_progress"}, format="json").json() == {"updated": 3}
    assert Enquiry.objects.filter(status="in_progress").count() == 3
    assert client.post(f"{ENQ}bulk/", {"ids": ids[:1], "action": "delete"}, format="json").json() == {"updated": 1}
    assert Enquiry.objects.count() == 2


def test_rbac(make_business, add_member, client_for):
    business = make_business()
    enquiry = make_enquiry(business)
    viewer = client_for(add_member(business, "viewer").user, business)
    staff = client_for(add_member(business, "staff").user, business)
    catalogue_mgr = client_for(add_member(business, "catalogue_manager").user, business)
    assert viewer.get(ENQ).status_code == 200
    assert viewer.patch(f"{ENQ}{enquiry.id}/", {"status": "closed"}, format="json").status_code == 403
    assert staff.patch(f"{ENQ}{enquiry.id}/", {"status": "contacted"}, format="json").status_code == 200
    assert staff.delete(f"{ENQ}{enquiry.id}/").status_code == 403
    assert staff.post(f"{ENQ}bulk/", {"ids": [str(enquiry.id)], "action": "delete"}, format="json").status_code == 403
    assert catalogue_mgr.get(ENQ).status_code == 403  # role without enquiry.view
    assert catalogue_mgr.get(CUST).status_code == 403


def test_enquiry_tenant_isolation(make_business, owner_client):
    a, b = make_business(), make_business()
    theirs = make_enquiry(b, name="Bravo lead")
    client = owner_client(a)
    assert client.get(ENQ).json()["count"] == 0
    assert client.get(f"{ENQ}{theirs.id}/").status_code == 404
    assert client.patch(f"{ENQ}{theirs.id}/", {"status": "closed"}, format="json").status_code == 404
    assert client.delete(f"{ENQ}{theirs.id}/").status_code == 404
    assert client.post(f"{ENQ}bulk/", {"ids": [str(theirs.id)], "action": "delete"}, format="json").status_code == 404
    theirs.refresh_from_db()
    assert theirs.status == "new"


# --- Customers ------------------------------------------------------------------------------
def test_customer_list_counts_and_detail(make_business, owner_client):
    business = make_business()
    customer = Customer.objects.create(business=business, name="Amit", phone="+919000000001")
    make_enquiry(business, customer=customer)
    make_enquiry(business, customer=customer, status="converted", phone="+919000000002")
    Customer.objects.create(business=business, name="Quiet", email="quiet@example.com")
    client = owner_client(business)
    rows = {r["name"]: r for r in client.get(CUST).json()["results"]}
    assert rows["Amit"]["enquiry_count"] == 2 and rows["Amit"]["open_enquiry_count"] == 1 and rows["Amit"]["converted_count"] == 1
    assert [r["name"] for r in client.get(CUST, {"has_open_enquiries": "true"}).json()["results"]] == ["Amit"]
    detail = client.get(f"{CUST}{customer.id}/").json()
    assert len(detail["enquiries"]) == 2
    summary = client.get(f"{CUST}summary/").json()
    assert summary["total"] == 2 and summary["with_open_enquiries"] == 1 and summary["converted"] == 1


def test_customer_create_update_validation(make_business, owner_client):
    business = make_business()
    client = owner_client(business)
    created = client.post(CUST, {"name": "Kavita Singh", "phone": "+91 97865 44321", "email": "K@Example.com", "city": "Jaipur"}, format="json")
    assert created.status_code == 201, created.content
    assert created.json()["phone"] == "+919786544321" and created.json()["email"] == "k@example.com"
    dup = client.post(CUST, {"name": "Copy", "phone": "+919786544321"}, format="json")
    assert dup.status_code == 400 and "phone" in dup.json()["error"]["details"]
    assert client.post(CUST, {"name": "No contact"}, format="json").status_code == 400
    assert client.post(CUST, {"name": "Bad", "email": "nope"}, format="json").status_code == 400
    updated = client.patch(f"{CUST}{created.json()['id']}/", {"company": "Singh Traders", "notes": "VIP"}, format="json")
    assert updated.status_code == 200 and updated.json()["company"] == "Singh Traders"


def test_deleting_customer_keeps_enquiry_history(make_business, owner_client):
    business = make_business()
    customer = Customer.objects.create(business=business, name="Amit", phone="+919000000001")
    enquiry = make_enquiry(business, customer=customer)
    assert owner_client(business).delete(f"{CUST}{customer.id}/").status_code == 204
    enquiry.refresh_from_db()
    assert enquiry.customer is None and enquiry.name == "Priya Mehta" and enquiry.phone == "+919000000001"


def test_customer_tenant_isolation_and_rbac(make_business, owner_client, add_member, client_for):
    a, b = make_business(), make_business()
    theirs = Customer.objects.create(business=b, name="Bravo", phone="+919000000009")
    client = owner_client(a)
    assert client.get(CUST).json()["count"] == 0
    for method in ("get", "delete"):
        assert getattr(client, method)(f"{CUST}{theirs.id}/").status_code == 404
    assert client.patch(f"{CUST}{theirs.id}/", {"name": "x"}, format="json").status_code == 404
    # Same phone is fine in another business.
    assert client.post(CUST, {"name": "Mine", "phone": "+919000000009"}, format="json").status_code == 201
    viewer = client_for(add_member(a, "viewer").user, a)
    assert viewer.get(CUST).status_code == 200
    assert viewer.post(CUST, {"name": "x", "phone": "+919000000008"}, format="json").status_code == 403
    assert owner_of(a)
