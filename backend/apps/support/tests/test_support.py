import uuid

import pytest
from django.core import mail

from apps.audit_logs.models import AuditLog
from apps.notifications.models import Notification
from apps.rbac.models import Permission, Role, RolePermission
from apps.support.models import SupportTicket, TicketMessage
from conftest import owner_of

URL = "/api/v1/support/tickets/"
ADMIN = "/api/v1/admin/support/tickets/"


def ticket_data(**overrides):
    data = {
        "subject": "Cannot upload product images",
        "category": "technical",
        "priority": "high",
        "description": "Uploading a JPG shows an error every time.",
    }
    data.update(overrides)
    return data


@pytest.fixture
def desk(make_business, make_user, client_for):
    business = make_business(name="Sharma Furniture")
    owner = owner_of(business)
    agent = make_user(platform_role="support_admin", full_name="Asha Agent")
    return {
        "business": business,
        "owner": owner,
        "client": client_for(owner, business),
        "agent": agent,
        "agent_client": client_for(agent),
    }


def create(client, **overrides):
    response = client.post(URL, ticket_data(**overrides), format="json")
    assert response.status_code == 201, response.content
    return response.json()


def requester_role(business):
    """Custom role that may raise tickets but not see colleagues' tickets."""
    role = Role.objects.create(business=business, name="Requester")
    RolePermission.objects.create(role=role, permission=Permission.objects.get(code="support.create"))
    return role


# --- Creation & validation ---------------------------------------------------------------------------
def test_create_ticket_notifies_support_staff(desk, django_capture_on_commit_callbacks):
    ticket = create(desk["client"])
    assert ticket["reference"].startswith("TKT-") and ticket["status"] == "open"
    assert ticket["messages"][0]["body"].startswith("Uploading a JPG")
    note = Notification.objects.get(recipient=desk["agent"], event="support.ticket_created")
    assert note.business is None and note.link == f"/admin/support?ticket={ticket['id']}"
    assert note.level == "warning"  # high priority
    assert AuditLog.objects.filter(action="support.ticket_created", business=desk["business"]).exists()


def test_ticket_numbers_increase(desk):
    first, second = create(desk["client"]), create(desk["client"])
    assert int(second["reference"][4:]) == int(first["reference"][4:]) + 1


def test_client_key_makes_create_idempotent(desk):
    key = str(uuid.uuid4())
    first = create(desk["client"], client_key=key)
    again = desk["client"].post(URL, ticket_data(client_key=key), format="json")
    assert again.status_code == 200 and again.json()["id"] == first["id"]
    assert SupportTicket.objects.count() == 1


@pytest.mark.parametrize("field,value", [
    ("subject", "Hi"), ("description", "short"), ("category", "gossip"), ("priority", "whenever"),
])
def test_validation(desk, field, value):
    response = desk["client"].post(URL, ticket_data(**{field: value}), format="json")
    assert response.status_code == 400 and field in response.json()["error"]["details"]


def test_creating_needs_support_create(desk, add_member, client_for):
    staff = add_member(desk["business"], "staff").user  # system Staff role has no support.* permission
    assert client_for(staff, desk["business"]).post(URL, ticket_data(), format="json").status_code == 403
    from rest_framework.test import APIClient

    assert APIClient().get(URL).status_code == 401


# --- Visibility & isolation --------------------------------------------------------------------------
def test_visibility_rules(desk, add_member, client_for, make_business):
    business = desk["business"]
    requester = add_member(business, requester_role(business)).user
    requester_client = client_for(requester, business)
    mine = create(requester_client, subject="My own problem here")
    owners = create(desk["client"], subject="Owner problem here")

    # Without support.view you only see your own tickets.
    assert [t["id"] for t in requester_client.get(URL).json()["results"]] == [mine["id"]]
    assert requester_client.get(f"{URL}{owners['id']}/").status_code == 404
    assert requester_client.post(f"{URL}{owners['id']}/reply/", {"body": "hi"}, format="json").status_code == 404
    # The owner (support.view) sees every ticket of the business.
    assert {t["id"] for t in desk["client"].get(URL).json()["results"]} == {mine["id"], owners["id"]}

    # Another business sees nothing and cannot address these tickets.
    other = make_business()
    other_client = client_for(owner_of(other), other)
    assert other_client.get(URL).json()["count"] == 0
    assert other_client.get(f"{URL}{mine['id']}/").status_code == 404
    assert client_for(owner_of(other), business).get(URL).status_code == 404  # foreign header


def test_business_users_cannot_use_admin_endpoints(desk):
    ticket = create(desk["client"])
    assert desk["client"].get(ADMIN).status_code == 403
    assert desk["client"].post(f"{ADMIN}{ticket['id']}/reply/", {"body": "x"}, format="json").status_code == 403


# --- Conversation & status policy --------------------------------------------------------------------
def test_requester_reply_close_and_reopen_rules(desk):
    client = desk["client"]
    ticket = create(client)
    url = f"{URL}{ticket['id']}/"
    data = client.post(f"{url}reply/", {"body": "Screenshot attached later"}, format="json").json()
    assert [m["body"] for m in data["messages"] if m["kind"] == "message"][-1] == "Screenshot attached later"
    assert client.post(f"{url}reply/", {"body": "   "}, format="json").status_code == 400

    # Requesters can't put a ticket in progress or resolve it themselves.
    response = client.post(f"{url}status/", {"status": "in_progress"}, format="json")
    assert response.status_code == 409 and response.json()["error"]["code"] == "invalid_status_transition"
    assert client.post(f"{url}status/", {"status": "closed"}, format="json").json()["status"] == "closed"
    closed = client.post(f"{url}reply/", {"body": "One more thing"}, format="json")
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "ticket_closed"
    assert client.post(f"{url}status/", {"status": "open"}, format="json").status_code == 409


def test_staff_workflow_internal_notes_and_notifications(desk, django_capture_on_commit_callbacks):
    ticket = create(desk["client"])
    agent = desk["agent_client"]
    url = f"{ADMIN}{ticket['id']}/"

    assert agent.get(ADMIN).json()["count"] == 1
    with django_capture_on_commit_callbacks(execute=True):
        agent.post(f"{url}reply/", {"body": "Internal: looks like a CDN issue", "internal": True}, format="json")
    assert not Notification.objects.filter(recipient=desk["owner"], event="support.staff_replied").exists()
    assert len(mail.outbox) == 0

    with django_capture_on_commit_callbacks(execute=True):
        data = agent.post(f"{url}reply/", {"body": "Please share a screenshot.", "status": "waiting_for_user"},
                          format="json").json()
    assert data["status"] == "waiting_for_user" and data["first_response_at"]
    assert Notification.objects.filter(recipient=desk["owner"], event="support.staff_replied").count() == 1
    assert len(mail.outbox) == 1 and desk["owner"].email in mail.outbox[0].to
    assert "Please share" not in mail.outbox[0].body  # email links to the ticket instead of quoting it

    # Business view: no internal note, staff shown as "Support team".
    detail = desk["client"].get(f"{URL}{ticket['id']}/").json()
    bodies = [m["body"] for m in detail["messages"]]
    assert "Internal: looks like a CDN issue" not in bodies and "Please share a screenshot." in bodies
    assert {m["author_name"] for m in detail["messages"] if m["is_staff"]} == {"Support team"}
    assert "Asha" not in str(detail)
    # Platform view keeps everything, with real names.
    admin_detail = agent.get(url).json()
    assert any(m["is_internal"] for m in admin_detail["messages"])

    # A requester reply while waiting moves the ticket back to open and alerts support.
    reply = desk["client"].post(f"{URL}{ticket['id']}/reply/", {"body": "Here it is"}, format="json").json()
    assert reply["status"] == "open"
    assert Notification.objects.filter(recipient=desk["agent"], event="support.user_replied").count() == 1

    with django_capture_on_commit_callbacks(execute=True):
        resolved = agent.post(f"{url}status/", {"status": "resolved"}, format="json").json()
    assert resolved["status"] == "resolved" and resolved["resolved_at"]
    assert len(mail.outbox) == 2
    # The requester may reopen a resolved ticket.
    assert desk["client"].post(f"{URL}{ticket['id']}/status/", {"status": "open"}, format="json").json()["status"] == "open"
    statuses = list(AuditLog.objects.filter(action="support.status_changed").values_list("changes", flat=True))
    assert {"status": {"from": "resolved", "to": "open"}} in statuses


def test_assignment_priority_and_staff_only_assignees(desk, make_user):
    ticket = create(desk["client"])
    agent = desk["agent_client"]
    url = f"{ADMIN}{ticket['id']}/"
    colleague = make_user(platform_role="super_admin", full_name="Ravi Root")

    data = agent.patch(url, {"assigned_to": str(colleague.id), "priority": "urgent"}, format="json").json()
    assert data["assigned_to"]["id"] == str(colleague.id) and data["priority"] == "urgent"
    assert Notification.objects.filter(recipient=colleague, event="support.assigned").exists()
    response = agent.patch(url, {"assigned_to": str(desk["owner"].id)}, format="json")
    assert response.status_code == 400 and "assigned_to" in response.json()["error"]["details"]
    assert agent.get(ADMIN, {"assigned": "none"}).json()["count"] == 0
    # Assignment is internal: the business never sees who.
    detail = desk["client"].get(f"{URL}{ticket['id']}/").json()
    assert "Ravi Root" not in str(detail) and detail["priority"] == "urgent"
    agents = agent.get(f"{ADMIN}agents/").json()
    assert {a["id"] for a in agents} == {str(desk["agent"].id), str(colleague.id)}


def test_admin_filters_search_and_summary(desk, make_business, client_for):
    first = create(desk["client"], subject="Payment not reflecting", category="billing")
    other = make_business(name="Gupta Textiles")
    create(client_for(owner_of(other), other), subject="QR code not working", category="qr_code", priority="low")
    agent = desk["agent_client"]

    assert agent.get(ADMIN, {"search": first["reference"]}).json()["count"] == 1
    assert agent.get(ADMIN, {"search": "gupta"}).json()["count"] == 1
    assert agent.get(ADMIN, {"category": "billing"}).json()["count"] == 1
    assert agent.get(ADMIN, {"business": str(other.id)}).json()["count"] == 1
    assert agent.get(ADMIN, {"status": ["open", "closed"]}).json()["count"] == 2
    summary = agent.get(f"{ADMIN}summary/").json()
    assert summary["total"] == 2 and summary["unassigned"] == 2
    assert {c["key"]: c["count"] for c in summary["categories"]}["qr_code"] == 1
    # Business-side summary only counts the business's own tickets.
    assert desk["client"].get(f"{URL}summary/").json()["total"] == 1


def test_support_admin_permissions_are_limited(desk, make_plan):
    agent = desk["agent_client"]
    assert agent.get("/api/v1/admin/audit-logs/").status_code == 403
    assert agent.post("/api/v1/admin/plans/", {"name": "X"}, format="json").status_code == 403
    me = agent.get("/api/v1/auth/me/").json()
    assert {"platform.support.view", "platform.support.manage"} <= set(me["platform_permissions"])
    assert "platform.audit_log.view" not in me["platform_permissions"]


def test_messages_persist_in_order(desk):
    ticket = create(desk["client"])
    for body in ("one", "two", "three"):
        desk["client"].post(f"{URL}{ticket['id']}/reply/", {"body": body}, format="json")
    bodies = list(TicketMessage.objects.filter(ticket_id=ticket["id"], kind="message").values_list("body", flat=True))
    assert bodies[1:] == ["one", "two", "three"]
