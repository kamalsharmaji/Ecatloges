import pytest
from django.core import mail

from apps.enquiries.tests.conftest import submit
from apps.notifications.models import Notification
from apps.notifications.services import notify, notify_members
from conftest import owner_of

URL = "/api/v1/notifications/"


@pytest.fixture
def storefront(make_business, make_category, make_product, make_catalogue):
    business = make_business(name="Sharma Furniture")
    category = make_category(business)
    live = make_product(business, category=category, name="Wooden Chair", status="published")
    catalogue = make_catalogue(business, name="Furniture", products=[live], status="published")
    return {"business": business, "catalogue": catalogue, "live": live, "draft": live}


def make_notes(user, business=None, n=3, **extra):
    for i in range(n):
        notify([user], business=business, event="system.test", category="system", title=f"Note {i}", **extra)


# --- Creation ---------------------------------------------------------------------------------------
def test_new_enquiry_notifies_only_members_who_can_view_enquiries(storefront, add_member, django_capture_on_commit_callbacks):
    business = storefront["business"]
    handler = add_member(business, "enquiry_manager").user
    catalogue_only = add_member(business, "catalogue_manager").user
    suspended = add_member(business, "manager", status="suspended").user

    with django_capture_on_commit_callbacks(execute=True):
        assert submit(storefront).status_code == 201

    recipients = set(Notification.objects.filter(event="enquiry.received").values_list("recipient_id", flat=True))
    assert recipients == {owner_of(business).pk, handler.pk}
    assert catalogue_only.pk not in recipients and suspended.pk not in recipients
    note = Notification.objects.filter(recipient=handler).get()
    assert note.business_id == business.pk and note.link.startswith("/app/enquiries?enquiry=")
    assert "Amit Patel" in note.body and "Wooden Chair" in note.body
    # No contact details or customer message in the notification.
    for secret in ("98271", "example.com", "best price"):
        assert secret not in note.title + note.body
    # The existing email is still sent exactly once.
    assert len(mail.outbox) == 1


def test_retried_enquiry_does_not_duplicate_notifications_or_emails(storefront, django_capture_on_commit_callbacks):
    key = "6f0c7c6e-6a5c-4c55-9a3e-1d1f3c2b9a10"
    with django_capture_on_commit_callbacks(execute=True):
        assert submit(storefront, idempotency_key=key).status_code == 201
        assert submit(storefront, idempotency_key=key).status_code == 200
    assert Notification.objects.filter(event="enquiry.received").count() == 1
    assert len(mail.outbox) == 1


def test_dedup_key_makes_notify_idempotent(make_user):
    user = make_user()
    for _ in range(3):
        notify([user], event="payment.captured", title="Paid", dedup_key="payment:1:captured")
    assert Notification.objects.filter(recipient=user).count() == 1


def test_notify_members_skips_inactive_users_and_other_businesses(make_business, add_member):
    business, other = make_business(), make_business()
    inactive = add_member(business, "manager").user
    inactive.is_active = False
    inactive.save()
    notify_members(business, "enquiry.view", event="enquiry.received", title="x")
    assert set(Notification.objects.values_list("recipient_id", flat=True)) == {owner_of(business).pk}
    assert not Notification.objects.filter(recipient=owner_of(other)).exists()


# --- API ----------------------------------------------------------------------------------------------
def test_list_summary_and_read_state(make_business, client_for):
    business = make_business()
    owner = owner_of(business)
    make_notes(owner, business, n=3)
    notify([owner], business=business, event="enquiry.received", category="enquiry", title="Enquiry")
    client = client_for(owner)

    data = client.get(URL, {"page_size": 2}).json()
    assert data["count"] == 4 and len(data["results"]) == 2
    summary = client.get(f"{URL}summary/").json()
    assert summary["unread"] == 4
    assert {c["category"]: c["unread"] for c in summary["categories"]}["enquiry"] == 1

    first = data["results"][0]["id"]
    assert client.post(f"{URL}{first}/read/").json()["is_read"] is True
    assert client.get(URL, {"status": "unread"}).json()["count"] == 3
    assert client.get(URL, {"status": "read"}).json()["count"] == 1
    assert client.post(f"{URL}{first}/unread/").json()["is_read"] is False

    assert client.post(f"{URL}read-all/", {"category": "system"}, format="json").json()["updated"] == 3
    assert client.get(f"{URL}summary/").json()["unread"] == 1
    assert client.post(f"{URL}read-all/", {}, format="json").json()["updated"] == 1
    assert client.get(URL, {"category": "enquiry"}).json()["count"] == 1
    assert client.delete(f"{URL}{first}/").status_code == 204
    assert client.get(URL).json()["count"] == 3


def test_users_cannot_see_or_change_each_others_notifications(make_business, add_member, client_for):
    business = make_business()
    owner = owner_of(business)
    colleague = add_member(business, "manager").user
    make_notes(owner, business, n=1)
    note = Notification.objects.get(recipient=owner)
    other = client_for(colleague)

    assert other.get(URL).json()["count"] == 0
    assert other.get(f"{URL}{note.id}/").status_code == 404
    assert other.post(f"{URL}{note.id}/read/").status_code == 404
    assert other.delete(f"{URL}{note.id}/").status_code == 404
    other.post(f"{URL}read-all/", {}, format="json")
    note.refresh_from_db()
    assert note.read_at is None
    from rest_framework.test import APIClient

    assert APIClient().get(URL).status_code == 401


def test_context_filter_and_departed_business(make_business, add_member, make_user, client_for):
    user = make_user()
    a, b = make_business(), make_business()
    membership = add_member(a, "manager", user=user)
    add_member(b, "manager", user=user)
    make_notes(user, a, n=2)
    make_notes(user, b, n=1)
    make_notes(user, None, n=1)  # personal / platform
    client = client_for(user)

    assert client.get(URL, {"context": str(a.id)}).json()["count"] == 2
    assert client.get(URL, {"context": "platform"}).json()["count"] == 1
    assert client.get(URL).json()["count"] == 4
    assert client.get(URL, {"context": "nope"}).status_code == 400

    # After leaving business A its notifications are no longer shown.
    membership.delete()
    assert client.get(URL).json()["count"] == 2
    assert client.get(URL, {"context": str(a.id)}).json()["count"] == 0


def test_role_change_and_new_member_notifications(make_business, add_member, client_for, make_user):
    from apps.businesses import services
    from apps.businesses.context import resolve_business_context
    from apps.businesses.models import StaffInvitation

    business = make_business()
    owner = owner_of(business)
    member = add_member(business, "staff")
    client = client_for(owner, business)
    manager = services.system_role("manager")
    response = client.patch(f"/api/v1/members/{member.id}/", {"role_id": str(manager.id)}, format="json")
    assert response.status_code == 200, response.content
    note = Notification.objects.get(recipient=member.user, event="team.role_changed")
    assert "Manager" in note.body

    # Invitee joins → people who can see the team hear about it.
    joiner = make_user(email="joiner@example.com")
    ctx = resolve_business_context(owner, business.id)
    invitation = services.invite_member(ctx, email=joiner.email, role=services.system_role("staff"))
    assert Notification.objects.filter(recipient=joiner, event="team.invited", business__isnull=True).exists()
    token = "known-token"
    StaffInvitation.objects.filter(pk=invitation.pk).update(token_hash=StaffInvitation.hash_token(token))
    services.accept_invitation(user=joiner, token=token)
    joined = Notification.objects.filter(event="team.member_joined")
    assert set(joined.values_list("recipient_id", flat=True)) >= {owner.pk}
    assert not joined.filter(recipient=joiner).exists()
