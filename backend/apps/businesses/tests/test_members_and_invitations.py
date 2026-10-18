import re
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.businesses.models import BusinessMembership, StaffInvitation
from apps.rbac.models import Role
from conftest import owner_of, system_role

pytestmark = pytest.mark.django_db

MEMBERS = "/api/v1/members/"


# --- Member management & RBAC enforcement ---------------------------------------------------
def test_owner_can_change_role_and_suspend(client_for, make_business, add_member):
    business = make_business()
    member = add_member(business, "staff")
    client = client_for(owner_of(business), business)
    response = client.patch(f"{MEMBERS}{member.id}/", {"role_id": str(system_role("manager").id), "status": "suspended"})
    assert response.status_code == 200, response.content
    member.refresh_from_db()
    assert member.role.key == "manager" and member.status == "suspended"


def test_viewer_can_list_but_not_manage(client_for, make_business, add_member):
    business = make_business()
    viewer = add_member(business, "viewer")
    other = add_member(business, "staff")
    client = client_for(viewer.user, business)
    assert client.get(MEMBERS).status_code == 200
    for response in (
        client.patch(f"{MEMBERS}{other.id}/", {"status": "suspended"}),
        client.delete(f"{MEMBERS}{other.id}/"),
        client.post("/api/v1/invitations/", {"email": "n@example.com", "role_id": str(system_role("staff").id)}),
    ):
        assert response.status_code == 403 and response.json()["error"]["code"] == "permission_denied"
    other.refresh_from_db()
    assert other.status == "active"


def test_staff_role_cannot_even_list_members(client_for, make_business, add_member):
    business = make_business()
    staff = add_member(business, "staff")
    assert client_for(staff.user, business).get(MEMBERS).status_code == 403


def test_nobody_can_change_their_own_membership(client_for, make_business):
    business = make_business()
    owner = owner_of(business)
    me = business.memberships.get(user=owner)
    response = client_for(owner, business).patch(f"{MEMBERS}{me.id}/", {"role_id": str(system_role("viewer").id)})
    assert response.status_code == 403


def test_admin_cannot_grant_owner_role_or_touch_owners(client_for, make_business, add_member):
    business = make_business()
    admin = add_member(business, "admin")
    staff = add_member(business, "staff")
    owner_membership = business.memberships.get(role__key="owner")
    client = client_for(admin.user, business)
    assert client.patch(f"{MEMBERS}{staff.id}/", {"role_id": str(system_role("owner").id)}).status_code == 403
    assert client.patch(f"{MEMBERS}{owner_membership.id}/", {"status": "suspended"}).status_code == 403
    assert client.delete(f"{MEMBERS}{owner_membership.id}/").status_code == 403
    # Admin can still manage ordinary members.
    assert client.patch(f"{MEMBERS}{staff.id}/", {"role_id": str(system_role("viewer").id)}).status_code == 200


def test_custom_role_holder_cannot_escalate(client_for, make_business, add_member):
    """A member who can manage people may only hand out roles within their own permissions."""
    business = make_business()
    lead_role = Role.objects.create(business=business, name="Team lead")
    lead_role.permissions.set(
        Role.permissions.rel.model.objects.filter(code__in=["member.view", "member.manage", "role.view", "role.manage"])
    )
    lead = add_member(business, lead_role)
    staff = add_member(business, "staff")
    client = client_for(lead.user, business)
    # Admin role contains permissions the lead lacks.
    assert client.patch(f"{MEMBERS}{staff.id}/", {"role_id": str(system_role("admin").id)}).status_code == 403
    # Nor can they create a role broader than themselves...
    response = client.post("/api/v1/roles/", {"name": "Super", "permissions": ["catalogue.delete"]})
    assert response.status_code == 403
    # ...or edit their own role.
    response = client.patch(f"/api/v1/roles/{lead_role.id}/", {"permissions": ["member.view"]})
    assert response.status_code == 403
    staff.refresh_from_db()
    assert staff.role.key == "staff"


# --- Last-owner protection & ownership transfer ---------------------------------------------
def test_last_owner_cannot_leave(client_for, make_business):
    business = make_business()
    response = client_for(owner_of(business), business).post("/api/v1/business-context/leave/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "last_owner"
    assert business.memberships.filter(role__key="owner").exists()


def test_suspended_owners_do_not_count_as_owners(client_for, make_business, add_member):
    business = make_business()
    owner = owner_of(business)
    co_owner = add_member(business, "owner")
    client = client_for(owner, business)
    assert client.patch(f"{MEMBERS}{co_owner.id}/", {"status": "suspended"}).status_code == 200
    response = client.post("/api/v1/business-context/leave/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "last_owner"


def test_owner_can_demote_another_owner_when_one_remains(client_for, make_business, add_member):
    business = make_business()
    co_owner = add_member(business, "owner")
    client = client_for(owner_of(business), business)
    response = client.patch(f"{MEMBERS}{co_owner.id}/", {"role_id": str(system_role("admin").id)})
    assert response.status_code == 200
    assert business.memberships.filter(role__key="owner", status="active").count() == 1


def test_non_last_owner_can_leave(client_for, make_business, add_member):
    business = make_business()
    co_owner = add_member(business, "owner")
    assert client_for(co_owner.user, business).post("/api/v1/business-context/leave/").status_code == 204
    assert not BusinessMembership.objects.filter(pk=co_owner.pk).exists()


def test_transfer_ownership(client_for, make_business, add_member):
    business = make_business()
    owner = owner_of(business)
    target = add_member(business, "manager")
    response = client_for(owner, business).post(f"{MEMBERS}transfer-ownership/", {"membership_id": str(target.id)})
    assert response.status_code == 200, response.content
    target.refresh_from_db()
    assert target.role.key == "owner"
    assert business.memberships.get(user=owner).role.key == "admin"
    # The former owner can now leave; the new owner is the last owner and cannot.
    assert client_for(owner, business).post("/api/v1/business-context/leave/").status_code == 204
    assert client_for(target.user, business).post("/api/v1/business-context/leave/").status_code == 409


def test_only_owner_can_transfer_and_only_to_active_members(client_for, make_business, add_member):
    business = make_business()
    admin = add_member(business, "admin")
    suspended = add_member(business, "staff", status="suspended")
    response = client_for(admin.user, business).post(f"{MEMBERS}transfer-ownership/", {"membership_id": str(admin.id)})
    assert response.status_code == 403
    response = client_for(owner_of(business), business).post(
        f"{MEMBERS}transfer-ownership/", {"membership_id": str(suspended.id)}
    )
    assert response.status_code == 409 and response.json()["error"]["code"] == "inactive_member"


# --- Invitations ----------------------------------------------------------------------------
def _invite(client, email, role_key="staff"):
    return client.post("/api/v1/invitations/", {"email": email, "role_id": str(system_role(role_key).id)})


def test_invitation_flow(client_for, make_business, make_user, django_capture_on_commit_callbacks):
    business = make_business()
    with django_capture_on_commit_callbacks(execute=True):
        response = _invite(client_for(owner_of(business), business), "New.Hire@Example.com", "manager")
    assert response.status_code == 201, response.content
    assert response.json()["email"] == "new.hire@example.com"
    token = re.search(r"token=(\S+)", mail.outbox[-1].body).group(1)
    invitation = StaffInvitation.objects.get()
    assert invitation.token_hash != token  # only the hash is stored

    invitee = make_user(email="new.hire@example.com")
    accepted = client_for(invitee).post("/api/v1/invitations/accept/", {"token": token})
    assert accepted.status_code == 201, accepted.content
    membership = BusinessMembership.objects.get(business=business, user=invitee)
    assert membership.role.key == "manager" and membership.is_active
    invitee.refresh_from_db()
    assert invitee.is_email_verified
    # Tokens are single use.
    assert client_for(invitee).post("/api/v1/invitations/accept/", {"token": token}).status_code == 404


def test_invitation_for_another_email_is_refused(client_for, make_business, make_user, django_capture_on_commit_callbacks):
    business = make_business()
    with django_capture_on_commit_callbacks(execute=True):
        _invite(client_for(owner_of(business), business), "intended@example.com")
    token = re.search(r"token=(\S+)", mail.outbox[-1].body).group(1)
    response = client_for(make_user(email="intruder@example.com")).post("/api/v1/invitations/accept/", {"token": token})
    assert response.status_code == 403
    assert not BusinessMembership.objects.filter(business=business, user__email="intruder@example.com").exists()


def test_expired_invitation_is_refused(client_for, make_business, make_user, django_capture_on_commit_callbacks):
    business = make_business()
    with django_capture_on_commit_callbacks(execute=True):
        _invite(client_for(owner_of(business), business), "late@example.com")
    token = re.search(r"token=(\S+)", mail.outbox[-1].body).group(1)
    StaffInvitation.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    response = client_for(make_user(email="late@example.com")).post("/api/v1/invitations/accept/", {"token": token})
    assert response.status_code == 409 and response.json()["error"]["code"] == "invitation_expired"


def test_invitation_rules(client_for, make_business, add_member):
    business = make_business()
    admin = add_member(business, "admin")
    owner_client = client_for(owner_of(business), business)
    assert _invite(owner_client, "dup@example.com").status_code == 201
    dup = _invite(owner_client, "DUP@example.com")
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "invitation_pending"
    existing = _invite(owner_client, admin.user.email)
    assert existing.status_code == 409 and existing.json()["error"]["code"] == "already_member"
    # Admins cannot invite someone straight in as owner.
    assert _invite(client_for(admin.user, business), "boss@example.com", "owner").status_code == 403


def test_revoked_invitation_cannot_be_accepted(client_for, make_business, make_user, django_capture_on_commit_callbacks):
    business = make_business()
    client = client_for(owner_of(business), business)
    with django_capture_on_commit_callbacks(execute=True):
        invitation_id = _invite(client, "rev@example.com").json()["id"]
    token = re.search(r"token=(\S+)", mail.outbox[-1].body).group(1)
    assert client.delete(f"/api/v1/invitations/{invitation_id}/").status_code == 204
    response = client_for(make_user(email="rev@example.com")).post("/api/v1/invitations/accept/", {"token": token})
    assert response.status_code == 404
