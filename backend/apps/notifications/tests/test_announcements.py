from datetime import timedelta
from io import StringIO

import pytest
from django.core import mail
from django.core.management import call_command
from django.utils import timezone

from apps.audit_logs.models import AuditLog
from apps.notifications.models import Announcement, Notification, NotificationPreference
from conftest import owner_of

URL = "/api/v1/admin/announcements/"
FEED = "/api/v1/announcements/"


@pytest.fixture
def world(make_business, make_user, add_member, client_for):
    a, b = make_business(name="Alpha"), make_business(name="Beta")
    staff_a = add_member(a, "staff").user
    root = make_user(platform_role="super_admin")
    agent = make_user(platform_role="support_admin")
    return {"a": a, "b": b, "staff_a": staff_a, "root": root, "agent": agent, "admin": client_for(root)}


def create(world, **overrides):
    data = {"title": "Scheduled maintenance", "body": "We'll be offline for 10 minutes on Sunday.", "audience": "all_businesses"}
    data.update(overrides)
    response = world["admin"].post(URL, data, format="json")
    assert response.status_code == 201, response.content
    return response.json()


def recipients(announcement_id):
    return set(Notification.objects.filter(dedup_key=f"announcement:{announcement_id}").values_list("recipient_id", flat=True))


def test_draft_is_private_until_published(world, client_for):
    ann = create(world)
    owner_a = client_for(owner_of(world["a"]))
    assert owner_a.get(FEED).json() == [] and recipients(ann["id"]) == set()
    published = world["admin"].post(f"{URL}{ann['id']}/publish/").json()
    assert published["status"] == "published" and published["recipient_count"] == 3
    assert [x["title"] for x in owner_a.get(FEED).json()] == ["Scheduled maintenance"]
    assert recipients(ann["id"]) == {owner_of(world["a"]).pk, owner_of(world["b"]).pk, world["staff_a"].pk}
    assert world["root"].pk not in recipients(ann["id"])  # not a business member → not in this audience


def test_audiences_are_never_broader_than_selected(world, client_for):
    owners = create(world, audience="business_owners")
    world["admin"].post(f"{URL}{owners['id']}/publish/")
    assert recipients(owners["id"]) == {owner_of(world["a"]).pk, owner_of(world["b"]).pk}

    selected = create(world, audience="selected_businesses", business_ids=[str(world["b"].id)])
    world["admin"].post(f"{URL}{selected['id']}/publish/")
    assert recipients(selected["id"]) == {owner_of(world["b"]).pk}
    assert client_for(owner_of(world["a"])).get(FEED).json()[0]["id"] == owners["id"]  # A never sees B's

    staff = create(world, audience="platform_staff")
    world["admin"].post(f"{URL}{staff['id']}/publish/")
    assert recipients(staff["id"]) == {world["root"].pk, world["agent"].pk}

    empty = create(world, audience="selected_businesses")
    r = world["admin"].post(f"{URL}{empty['id']}/publish/")
    assert r.status_code == 409 and r.json()["error"]["code"] == "audience_empty"
    bad = world["admin"].post(URL, {"title": "Hello all", "body": "x", "audience": "all_businesses", "business_ids": [str(world["a"].id)]}, format="json")
    assert bad.status_code == 400


def test_audience_count_matches_delivery(world):
    count = world["admin"].post(f"{URL}audience-count/", {"audience": "selected_businesses", "business_ids": [str(world["a"].id)]}, format="json").json()
    assert count == {"recipients": 2}


def test_republish_and_retries_never_duplicate(world):
    ann = create(world)
    world["admin"].post(f"{URL}{ann['id']}/publish/")
    world["admin"].post(f"{URL}{ann['id']}/publish/")  # double click
    assert world["admin"].post(f"{URL}{ann['id']}/unpublish/").json()["status"] == "unpublished"
    world["admin"].post(f"{URL}{ann['id']}/publish/")
    assert Notification.objects.filter(dedup_key=f"announcement:{ann['id']}").count() == 3
    # Audience can't change after delivery.
    r = world["admin"].patch(f"{URL}{ann['id']}/", {"audience": "business_owners"}, format="json")
    assert r.status_code == 400


def test_scheduling_is_timezone_aware_and_delivered_once(world, client_for):
    start = (timezone.now() + timedelta(hours=1)).isoformat()
    ann = create(world, starts_at=start)
    assert world["admin"].post(f"{URL}{ann['id']}/publish/").json()["status"] == "scheduled"
    assert recipients(ann["id"]) == set()
    assert client_for(owner_of(world["a"])).get(FEED).json() == []
    call_command("publish_announcements", stdout=StringIO())  # not due yet
    assert recipients(ann["id"]) == set()

    Announcement.objects.filter(pk=ann["id"]).update(starts_at=timezone.now() - timedelta(minutes=1))
    call_command("publish_announcements", stdout=StringIO())
    call_command("publish_announcements", stdout=StringIO())  # retried job
    assert Notification.objects.filter(dedup_key=f"announcement:{ann['id']}").count() == 3
    assert Announcement.objects.get(pk=ann["id"]).status == "published"
    assert AuditLog.objects.filter(action="announcement.published", target_id=ann["id"]).exists()


def test_end_time_hides_from_feed(world, client_for):
    ann = create(world, ends_at=(timezone.now() + timedelta(hours=1)).isoformat())
    world["admin"].post(f"{URL}{ann['id']}/publish/")
    Announcement.objects.filter(pk=ann["id"]).update(ends_at=timezone.now() - timedelta(minutes=1))
    assert client_for(owner_of(world["a"])).get(FEED).json() == []
    r = world["admin"].post(URL, {"title": "Bad window", "body": "x", "starts_at": timezone.now().isoformat(),
                                  "ends_at": (timezone.now() - timedelta(hours=1)).isoformat()}, format="json")
    assert r.status_code == 400


def test_email_only_to_opted_in_and_in_app_respects_preferences(world, django_capture_on_commit_callbacks):
    owner_a = owner_of(world["a"])
    NotificationPreference.objects.create(user=owner_a, key="announcement", in_app=True, email=True)
    NotificationPreference.objects.create(user=world["staff_a"], key="announcement", in_app=False, email=False)
    ann = create(world, send_email=True)
    with django_capture_on_commit_callbacks(execute=True):
        world["admin"].post(f"{URL}{ann['id']}/publish/")
    assert [m.to for m in mail.outbox] == [[owner_a.email]]
    assert world["staff_a"].pk not in recipients(ann["id"])


def test_announcement_shows_in_business_context_notifications(world, client_for):
    ann = create(world)
    world["admin"].post(f"{URL}{ann['id']}/publish/")
    owner = client_for(owner_of(world["a"]))
    listed = owner.get("/api/v1/notifications/", {"context": str(world["a"].id)}).json()["results"]
    assert [n["category"] for n in listed] == ["announcement"]


def test_only_super_admin_can_manage(world, client_for):
    for client in (client_for(world["agent"]), client_for(owner_of(world["a"]), world["a"])):
        assert client.get(URL).status_code == 403
        assert client.post(URL, {"title": "Hacked", "body": "x", "audience": "all_businesses"}, format="json").status_code == 403
    ann = create(world)
    assert client_for(world["agent"]).post(f"{URL}{ann['id']}/publish/").status_code == 403
    assert Notification.objects.count() == 0


def test_archive_and_audit(world):
    ann = create(world)
    assert world["admin"].post(f"{URL}{ann['id']}/archive/").json()["status"] == "archived"
    assert world["admin"].post(f"{URL}{ann['id']}/publish/").status_code == 409
    assert world["admin"].patch(f"{URL}{ann['id']}/", {"title": "New title"}, format="json").status_code == 400
    actions = set(AuditLog.objects.filter(target_id=ann["id"]).values_list("action", flat=True))
    assert {"announcement.created", "announcement.archived"} <= actions
