import uuid

import pytest
from django.test import override_settings

from apps.accounts.models import PlatformRole
from apps.businesses.models import Business, BusinessMembership

pytestmark = pytest.mark.django_db

BUSINESSES = "/api/v1/businesses/"
CONTEXT = "/api/v1/business-context/"


def business_payload(**overrides):
    data = {
        "name": "Acme Textiles",
        "owner_name": "Asha Rao",
        "phone": "+91 98200 12345",
        "email": "Sales@Acme.example",
        "category": "wholesale",
        "address_line1": "12 Market Road",
        "city": "Surat",
        "state": "Gujarat",
        "postal_code": "395003",
        "country": "in",
    }
    data.update(overrides)
    return data


def test_create_business_makes_caller_owner(client_for, make_user):
    user = make_user()
    response = client_for(user).post(BUSINESSES, business_payload())
    assert response.status_code == 201, response.content
    body = response.json()
    uuid.UUID(body["id"])
    assert body["slug"] == "acme-textiles" and body["country"] == "IN" and body["email"] == "sales@acme.example"
    membership = BusinessMembership.objects.get(business_id=body["id"], user=user)
    assert membership.is_owner and membership.is_active


def test_create_business_generates_unique_slugs(client_for, make_user):
    user = make_user()
    client = client_for(user)
    first = client.post(BUSINESSES, business_payload()).json()
    second = client.post(BUSINESSES, business_payload()).json()
    assert first["slug"] == "acme-textiles" and second["slug"] == "acme-textiles-2"


def test_create_business_ignores_client_supplied_id_status_and_slug(client_for, make_user):
    forced_id = uuid.uuid4()
    response = client_for(make_user()).post(
        BUSINESSES, business_payload(id=str(forced_id), status="suspended", slug="hijack")
    )
    assert response.status_code == 201
    business = Business.objects.get()
    assert business.id != forced_id and business.status == "active" and business.slug == "acme-textiles"


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"category": "spaceship"}, "category"),
        ({"phone": "call me"}, "phone"),
        ({"country": "India"}, "country"),
        ({"name": "A"}, "name"),
        ({"email": "nope"}, "email"),
        ({"address_line1": ""}, "address_line1"),
    ],
)
def test_create_business_validation(client_for, make_user, overrides, field):
    response = client_for(make_user()).post(BUSINESSES, business_payload(**overrides))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert field in response.json()["error"]["details"]
    assert not Business.objects.exists()


@override_settings(MAX_BUSINESSES_PER_USER=1)
def test_business_ownership_limit(client_for, make_user):
    client = client_for(make_user())
    assert client.post(BUSINESSES, business_payload()).status_code == 201
    response = client.post(BUSINESSES, business_payload(name="Second"))
    assert response.status_code == 409 and response.json()["error"]["code"] == "business_limit_reached"


def test_create_business_requires_auth(api):
    assert api.post(BUSINESSES, business_payload()).status_code == 401


def test_list_shows_only_callers_memberships(client_for, make_business, add_member, make_user):
    me = make_user()
    mine = make_business(owner=me)
    joined = make_business()
    add_member(joined, "viewer", user=me)
    make_business()  # someone else's
    body = client_for(me).get(BUSINESSES).json()
    ids = {row["business"]["id"] for row in body["results"]}
    assert ids == {str(mine.id), str(joined.id)}
    roles = {row["business"]["id"]: row["role"]["key"] for row in body["results"]}
    assert roles[str(mine.id)] == "owner" and roles[str(joined.id)] == "viewer"


def test_owner_can_view_and_update_profile(client_for, make_business):
    business = make_business()
    client = client_for(business.memberships.get().user)
    assert client.get(f"{BUSINESSES}{business.id}/").json()["name"] == business.name
    response = client.patch(f"{BUSINESSES}{business.id}/", {"city": "Pune", "status": "suspended"})
    assert response.status_code == 200
    business.refresh_from_db()
    assert business.city == "Pune" and business.status == "active"


def test_viewer_cannot_update_profile(client_for, make_business, add_member):
    business = make_business()
    viewer = add_member(business, "viewer").user
    client = client_for(viewer)
    assert client.get(f"{BUSINESSES}{business.id}/").status_code == 200
    response = client.patch(f"{BUSINESSES}{business.id}/", {"city": "Pune"})
    assert response.status_code == 403 and response.json()["error"]["code"] == "permission_denied"


# --- X-Business-ID context ------------------------------------------------------------------
def test_context_requires_header(client_for, make_business):
    business = make_business()
    response = client_for(business.memberships.get().user).get(CONTEXT)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "business_header_required"


def test_context_rejects_malformed_header(client_for, make_business):
    business = make_business()
    client = client_for(business.memberships.get().user)
    response = client.get(CONTEXT, HTTP_X_BUSINESS_ID="not-a-uuid")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_business_header"


def test_context_unknown_business_is_404(client_for, make_business):
    business = make_business()
    client = client_for(business.memberships.get().user)
    assert client.get(CONTEXT, HTTP_X_BUSINESS_ID=str(uuid.uuid4())).status_code == 404


def test_context_returns_role_and_permissions(client_for, make_business, add_member):
    business = make_business()
    viewer = add_member(business, "viewer").user
    body = client_for(viewer, business).get(CONTEXT).json()
    assert body["business"]["id"] == str(business.id)
    assert body["role"]["key"] == "viewer" and body["is_owner"] is False
    assert "member.view" in body["permissions"] and "member.manage" not in body["permissions"]


def test_suspended_membership_has_no_access(client_for, make_business, add_member):
    business = make_business()
    member = add_member(business, "admin", status=BusinessMembership.Status.SUSPENDED).user
    client = client_for(member, business)
    assert client.get(CONTEXT).status_code == 404
    assert client.get("/api/v1/members/").status_code == 404
    assert client.get(f"{BUSINESSES}{business.id}/").status_code == 404
    assert client.patch(f"{BUSINESSES}{business.id}/", {"city": "X"}).status_code == 404


def test_suspended_business_is_blocked(client_for, make_business):
    business = make_business(status=Business.Status.SUSPENDED)
    response = client_for(business.memberships.get().user, business).get(CONTEXT)
    assert response.status_code == 403 and response.json()["error"]["code"] == "business_suspended"


def test_platform_super_admin_has_no_implicit_business_access(client_for, make_business, make_user):
    business = make_business()
    admin = make_user(platform_role=PlatformRole.SUPER_ADMIN, is_staff=True, is_superuser=True)
    client = client_for(admin, business)
    assert client.get(CONTEXT).status_code == 404
    assert client.get(f"{BUSINESSES}{business.id}/").status_code == 404
