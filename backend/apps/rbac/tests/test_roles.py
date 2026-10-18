import pytest

from apps.accounts.models import PlatformRole
from apps.rbac.models import Permission, Role
from apps.rbac.registry import ASSIGNABLE_CODES, PERMISSION_CODES, SYSTEM_ROLES
from apps.rbac.signals import sync_rbac
from conftest import owner_of, system_role

pytestmark = pytest.mark.django_db

ROLES = "/api/v1/roles/"


def test_registry_is_synced_after_migrate():
    assert set(Permission.objects.values_list("code", flat=True)) == PERMISSION_CODES
    for role_def in SYSTEM_ROLES:
        role = system_role(role_def.key)
        assert role.is_system and role.permission_codes() == role_def.permissions
    # Only the owner role holds owner-reserved permissions.
    reserved = PERMISSION_CODES - ASSIGNABLE_CODES
    assert reserved and all(not (reserved & r.permissions) for r in SYSTEM_ROLES if r.key != "owner")


def test_sync_is_idempotent():
    before = Role.objects.count(), Permission.objects.count()
    sync_rbac()
    sync_rbac()
    assert (Role.objects.count(), Permission.objects.count()) == before


def test_permission_catalogue_excludes_reserved(client_for, make_user):
    codes = {p["code"] for p in client_for(make_user()).get("/api/v1/permissions/").json()}
    assert codes == ASSIGNABLE_CODES
    assert "subscription.manage" not in codes and "business.transfer_ownership" not in codes


def test_owner_creates_updates_and_deletes_custom_role(client_for, make_business):
    business = make_business()
    client = client_for(owner_of(business), business)
    created = client.post(
        ROLES, {"name": "Photographer", "description": "Uploads media", "permissions": ["media.view", "media.upload"]}
    )
    assert created.status_code == 201, created.content
    role_id = created.json()["id"]
    assert created.json()["permissions"] == ["media.upload", "media.view"]
    assert Role.objects.get(pk=role_id).business_id == business.id

    updated = client.patch(f"{ROLES}{role_id}/", {"permissions": ["media.view"]})
    assert updated.status_code == 200 and updated.json()["permissions"] == ["media.view"]
    assert client.delete(f"{ROLES}{role_id}/").status_code == 204


def test_role_names_are_unique_per_business(client_for, make_business):
    business = make_business()
    client = client_for(owner_of(business), business)
    assert client.post(ROLES, {"name": "Packer", "permissions": []}).status_code == 201
    response = client.post(ROLES, {"name": "Packer", "permissions": []})
    assert response.status_code == 400 and "name" in response.json()["error"]["details"]
    # The same name in another business is fine.
    other = make_business()
    assert client_for(owner_of(other), other).post(ROLES, {"name": "Packer", "permissions": []}).status_code == 201


@pytest.mark.parametrize("code", ["platform.super_admin", "subscription.manage", "business.transfer_ownership", "nope"])
def test_cannot_put_platform_reserved_or_unknown_permissions_in_roles(client_for, make_business, code):
    business = make_business()
    response = client_for(owner_of(business), business).post(ROLES, {"name": "Sneaky", "permissions": [code]})
    assert response.status_code == 400
    assert "permissions" in response.json()["error"]["details"]
    assert not Role.objects.filter(name="Sneaky").exists()


def test_system_roles_are_read_only(client_for, make_business):
    business = make_business()
    client = client_for(owner_of(business), business)
    url = f"{ROLES}{system_role('viewer').id}/"
    response = client.patch(url, {"permissions": ["member.manage"]})
    assert response.status_code == 409 and response.json()["error"]["code"] == "system_role"
    assert client.delete(url).status_code == 409
    assert "member.manage" not in system_role("viewer").permission_codes()


def test_role_in_use_cannot_be_deleted(client_for, make_business, add_member):
    business = make_business()
    role = Role.objects.create(business=business, name="Busy")
    add_member(business, role)
    response = client_for(owner_of(business), business).delete(f"{ROLES}{role.id}/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "role_in_use"


def test_manager_cannot_manage_roles(client_for, make_business, add_member):
    business = make_business()
    manager = add_member(business, "manager")
    client = client_for(manager.user, business)
    assert client.get(ROLES).status_code == 200
    assert client.post(ROLES, {"name": "X", "permissions": []}).status_code == 403


def test_business_roles_never_grant_platform_privileges(client_for, make_business, add_member):
    business = make_business()
    member = add_member(business, "staff")
    client = client_for(owner_of(business), business)
    client.patch(
        f"/api/v1/members/{member.id}/",
        {"platform_role": PlatformRole.SUPER_ADMIN, "is_owner": True, "user": {"is_superuser": True}},
    )
    member.user.refresh_from_db()
    member.refresh_from_db()
    assert member.user.platform_role == PlatformRole.NONE and not member.user.is_superuser
    assert member.role.key == "staff"
