import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.enquiries.tests.conftest import submit
from apps.notifications.models import Notification, NotificationPreference
from apps.notifications.services import notify, notify_members
from conftest import owner_of

URL = "/api/v1/notifications/preferences/"


@pytest.fixture
def storefront(make_business, make_category, make_product, make_catalogue):
    business = make_business(name="Sharma Furniture")
    live = make_product(business, category=make_category(business), name="Wooden Chair", status="published")
    catalogue = make_catalogue(business, name="Furniture", products=[live], status="published")
    return {"business": business, "catalogue": catalogue, "live": live, "draft": live}


def rows(client):
    return {r["key"]: r for r in client.get(URL).json()}


def test_defaults_for_a_user_with_no_saved_preferences(make_user, client_for):
    prefs = rows(client_for(make_user()))
    assert prefs["enquiry"]["in_app"] is True and prefs["enquiry"]["email_available"] is False
    assert prefs["support"]["in_app"] is True and prefs["support"]["email"] is True
    assert prefs["announcement"]["email"] is False
    assert prefs["billing"]["in_app_locked"] is True and prefs["billing"]["in_app"] is True
    assert prefs["security"]["email_locked"] is True and prefs["security"]["in_app_available"] is False
    assert NotificationPreference.objects.count() == 0  # defaults need no rows


def test_update_and_validation(make_user, client_for):
    user = make_user()
    client = client_for(user)
    response = client.patch(URL, {"preferences": [{"key": "enquiry", "in_app": False}, {"key": "announcement", "email": True}]}, format="json")
    assert response.status_code == 200, response.content
    prefs = {r["key"]: r for r in response.json()}
    assert prefs["enquiry"]["in_app"] is False and prefs["announcement"]["email"] is True

    for bad in (
        [{"key": "billing", "in_app": False}],   # mandatory
        [{"key": "security", "email": False}],   # mandatory
        [{"key": "enquiry", "email": True}],     # channel doesn't exist
        [{"key": "nope", "in_app": False}],
    ):
        r = client.patch(URL, {"preferences": bad}, format="json")
        assert r.status_code == 400, bad
    assert rows(client)["enquiry"]["in_app"] is False  # failed requests changed nothing


def test_preferences_are_per_user(make_user, client_for):
    a, b = make_user(), make_user()
    client_for(a).patch(URL, {"preferences": [{"key": "support", "email": False}]}, format="json")
    assert rows(client_for(b))["support"]["email"] is True
    assert APIClient().get(URL).status_code == 401


def test_optional_in_app_suppressed_but_others_still_notified(storefront, add_member, client_for, django_capture_on_commit_callbacks):
    business = storefront["business"]
    owner = owner_of(business)
    colleague = add_member(business, "manager").user
    client_for(owner).patch(URL, {"preferences": [{"key": "enquiry", "in_app": False}]}, format="json")
    with django_capture_on_commit_callbacks(execute=True):
        assert submit(storefront).status_code == 201
    recipients = set(Notification.objects.filter(event="enquiry.received").values_list("recipient_id", flat=True))
    assert recipients == {colleague.pk}
    assert len(mail.outbox) == 1  # business enquiry email unaffected by a personal in-app setting


def test_mandatory_billing_notifications_ignore_opt_out(make_business):
    business = make_business()
    owner = owner_of(business)
    # Even a stale/forged row can't silence a locked category.
    NotificationPreference.objects.create(user=owner, key="billing", in_app=False)
    notify_members(business, "subscription.view", event="payment.failed", category="payment", title="Payment failed")
    assert Notification.objects.filter(recipient=owner, event="payment.failed").exists()


def test_explicit_mandatory_flag_bypasses_preferences(make_user):
    user = make_user()
    NotificationPreference.objects.create(user=user, key="support", in_app=False)
    notify([user], event="support.x", category="support", title="optional")
    notify([user], event="support.y", category="support", title="required", mandatory=True)
    assert list(Notification.objects.filter(recipient=user).values_list("title", flat=True)) == ["required"]


def test_dedup_still_holds_with_preferences(make_user):
    user = make_user()
    NotificationPreference.objects.create(user=user, key="support", in_app=True)
    for _ in range(3):
        notify([user], event="support.staff_replied", category="support", title="Reply", dedup_key="ticketmsg:1")
    assert Notification.objects.filter(recipient=user).count() == 1


def test_support_email_opt_out_keeps_in_app(make_business, make_user, client_for, django_capture_on_commit_callbacks):
    business = make_business()
    owner = owner_of(business)
    owner_client = client_for(owner, business)
    agent = client_for(make_user(platform_role="support_admin"))
    ticket = owner_client.post("/api/v1/support/tickets/", {
        "subject": "Need help with QR", "category": "qr_code", "description": "The QR code does not scan on iPhone.",
    }, format="json").json()
    owner_client.patch(URL, {"preferences": [{"key": "support", "email": False}]}, format="json")
    with django_capture_on_commit_callbacks(execute=True):
        agent.post(f"/api/v1/admin/support/tickets/{ticket['id']}/reply/", {"body": "Try again now."}, format="json")
    assert len(mail.outbox) == 0
    assert Notification.objects.filter(recipient=owner, event="support.staff_replied").exists()


def test_business_enquiry_email_switch(storefront, owner_client, django_capture_on_commit_callbacks):
    client = owner_client(storefront["business"])
    assert client.patch("/api/v1/business-settings/", {"enquiry_email_enabled": False}, format="json").status_code == 200
    with django_capture_on_commit_callbacks(execute=True):
        assert submit(storefront).status_code == 201
    assert len(mail.outbox) == 0
    assert Notification.objects.filter(event="enquiry.received").exists()


def test_preference_changes_are_audited_without_hiding_values(make_user, client_for):
    from apps.audit_logs.models import AuditLog

    user = make_user()
    client_for(user).patch(URL, {"preferences": [{"key": "support", "email": False}]}, format="json")
    entry = AuditLog.objects.get(action="notification.preferences_updated")
    assert entry.scope == "account" and entry.changes == {"Support tickets (e-mail)": {"from": True, "to": False}}
