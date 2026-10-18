"""
User A (owner of Business A) must never read or modify Business B's records, whichever
endpoint, header or ID combination they try.
"""
import pytest

from apps.businesses.models import BusinessMembership, StaffInvitation
from apps.rbac.models import Role
from conftest import owner_of

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenants(make_business, add_member):
    a = make_business(name="Alpha")
    b = make_business(name="Bravo")
    b_member = add_member(b, "staff")
    b_role = Role.objects.create(business=b, name="Bravo Custom")
    b_invite = StaffInvitation.objects.create(
        business=b, email="pending@example.com", role=b_role, token_hash="x" * 64,
        invited_by=owner_of(b), expires_at="2099-01-01T00:00:00Z",
    )
    return {"a": a, "b": b, "b_member": b_member, "b_role": b_role, "b_invite": b_invite, "user_a": owner_of(a)}


def _not_found(response):
    assert response.status_code == 404, response.content
    assert response.json()["error"]["code"] == "not_found"
    # The error must not echo any of the other tenant's data.
    assert "Bravo" not in response.content.decode()


def test_header_for_foreign_business_is_404_everywhere(client_for, tenants):
    client = client_for(tenants["user_a"], tenants["b"])
    for url in ("/api/v1/business-context/", "/api/v1/members/", "/api/v1/roles/", "/api/v1/invitations/"):
        _not_found(client.get(url))
    _not_found(client.post("/api/v1/roles/", {"name": "x", "permissions": []}))
    _not_found(client.post("/api/v1/invitations/", {"email": "a@b.co", "role_id": str(tenants["b_role"].id)}))
    _not_found(client.post("/api/v1/business-context/leave/"))


def test_business_detail_and_update_of_foreign_business_is_404(client_for, tenants):
    client = client_for(tenants["user_a"])
    url = f"/api/v1/businesses/{tenants['b'].id}/"
    _not_found(client.get(url))
    _not_found(client.patch(url, {"name": "Hacked"}))
    tenants["b"].refresh_from_db()
    assert tenants["b"].name == "Bravo"


def test_foreign_member_detail_update_delete_via_own_header_is_404(client_for, tenants):
    client = client_for(tenants["user_a"], tenants["a"])
    url = f"/api/v1/members/{tenants['b_member'].id}/"
    _not_found(client.get(url))
    _not_found(client.patch(url, {"status": "suspended"}))
    _not_found(client.delete(url))
    tenants["b_member"].refresh_from_db()
    assert tenants["b_member"].status == BusinessMembership.Status.ACTIVE


def test_member_list_never_includes_other_tenants(client_for, tenants):
    body = client_for(tenants["user_a"], tenants["a"]).get("/api/v1/members/").json()
    emails = {row["user"]["email"] for row in body["results"]}
    assert emails == {tenants["user_a"].email}


def test_foreign_custom_role_is_invisible_and_immutable(client_for, tenants):
    client = client_for(tenants["user_a"], tenants["a"])
    names = {r["name"] for r in client.get("/api/v1/roles/").json()}
    assert "Bravo Custom" not in names
    url = f"/api/v1/roles/{tenants['b_role'].id}/"
    _not_found(client.get(url))
    _not_found(client.patch(url, {"name": "Owned"}))
    _not_found(client.delete(url))
    assert Role.objects.filter(pk=tenants["b_role"].pk, name="Bravo Custom").exists()


def test_cannot_assign_foreign_custom_role(client_for, tenants, add_member):
    a_member = add_member(tenants["a"], "viewer")
    client = client_for(tenants["user_a"], tenants["a"])
    response = client.patch(f"/api/v1/members/{a_member.id}/", {"role_id": str(tenants["b_role"].id)})
    assert response.status_code == 400 and "role_id" in response.json()["error"]["details"]
    response = client.post("/api/v1/invitations/", {"email": "x@example.com", "role_id": str(tenants["b_role"].id)})
    assert response.status_code == 400
    a_member.refresh_from_db()
    assert a_member.role.key == "viewer"


def test_foreign_invitation_cannot_be_revoked(client_for, tenants):
    client = client_for(tenants["user_a"], tenants["a"])
    _not_found(client.delete(f"/api/v1/invitations/{tenants['b_invite'].id}/"))
    tenants["b_invite"].refresh_from_db()
    assert tenants["b_invite"].status == StaffInvitation.Status.PENDING


def test_cannot_transfer_ownership_to_foreign_member(client_for, tenants):
    client = client_for(tenants["user_a"], tenants["a"])
    response = client.post("/api/v1/members/transfer-ownership/", {"membership_id": str(tenants["b_member"].id)})
    _not_found(response)
    tenants["b_member"].refresh_from_db()
    assert tenants["b_member"].role.key == "staff"
