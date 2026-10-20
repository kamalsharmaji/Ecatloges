import pytest
from django.core import mail

from apps.audit_logs.models import AuditLog
from apps.notifications.email_templates import REGISTRY, TemplateError, render, render_text, validate
from apps.notifications.emails import send_email
from apps.notifications.models import EmailTemplate
from conftest import owner_of

URL = "/api/v1/admin/email-templates/"


@pytest.fixture
def admin(make_user, client_for):
    user = make_user(platform_role="super_admin", email="root@example.com")
    return user, client_for(user)


# --- Engine -----------------------------------------------------------------------------------------
@pytest.mark.parametrize("key", list(REGISTRY))
def test_built_in_defaults_are_valid(key):
    d = REGISTRY[key]
    validate(d, d.subject, d.body)
    subject, body = render(d, d.subject, d.body, d.sample)
    assert "{{" not in subject + body


@pytest.mark.parametrize("subject,body,field", [
    ("Hi", "{% load static %}{{ verify_url }}", "body"),
    ("Hi", "{{ verify_url }} {{ settings.SECRET_KEY }}", "body"),
    ("Hi", "{{ verify_url|safe }}", "body"),
    ("Hi", "{{ verify_url }} {# comment #}", "body"),
    ("Hi {{ password }}", "{{ verify_url }}", "subject"),
    ("Hi", "Please verify.", "body"),                         # required variable missing
    ("Line one\nline two", "{{ verify_url }}", "subject"),    # header injection
    ("", "{{ verify_url }}", "subject"),
])
def test_unsafe_or_invalid_templates_rejected(subject, body, field):
    with pytest.raises(TemplateError) as exc:
        validate(REGISTRY["account.verify_email"], subject, body)
    assert field in exc.value.errors


def test_values_are_never_evaluated_and_empty_optional_lines_drop():
    text = "Name: {{ customer_name }}\nEmail: {{ customer_email }}\nEnd"
    out = render_text(text, {"customer_name": "{% debug %}{{ secret }}", "customer_email": ""})
    assert out == "Name: {% debug %}{{ secret }}\nEnd"
    assert render_text("Re: {{ title }}", {"title": "a\r\nBcc: x@y.z"}, single_line=True) == "Re: a Bcc: x@y.z"


def test_only_allowlisted_context_reaches_the_template():
    d = REGISTRY["support.reply"]
    _, body = render(d, d.subject, "{{ name }}", {"name": "Priya", "password": "hunter2"})
    assert body == "Priya"


# --- Sending with overrides and fallback --------------------------------------------------------
def test_active_override_is_used_inactive_and_invalid_fall_back(make_user):
    EmailTemplate.objects.create(key="support.reply", subject="Custom {{ ticket_reference }}", body="Hi {{ name }} {{ ticket_url }}")
    ctx = {"name": "Priya", "ticket_reference": "TKT-1", "ticket_subject": "S", "ticket_url": "https://x/t"}
    send_email("support.reply", to="a@example.com", context=ctx)
    assert mail.outbox[-1].subject == "Custom TKT-1"

    EmailTemplate.objects.filter(key="support.reply").update(is_active=False)
    send_email("support.reply", to="a@example.com", context=ctx)
    assert mail.outbox[-1].subject == "Re: [TKT-1] S"

    # A row that bypassed validation (e.g. edited in the database) is ignored, not executed.
    EmailTemplate.objects.filter(key="support.reply").update(is_active=True, body="{% now 'Y' %}")
    send_email("support.reply", to="a@example.com", context=ctx)
    assert mail.outbox[-1].subject == "Re: [TKT-1] S" and "{% now" not in mail.outbox[-1].body


# --- Admin API ------------------------------------------------------------------------------------
def test_super_admin_edit_preview_test_and_reset(admin):
    user, client = admin
    items = client.get(URL).json()
    assert {t["key"] for t in items} == set(REGISTRY)
    assert all(not t["is_custom"] for t in items)

    preview = client.post(f"{URL}support.reply/preview/", {"body": "Hi {{ name }}, see {{ ticket_url }} {{ oops }}"}, format="json").json()
    assert "oops" in preview["errors"]["body"][0] and preview["body"].startswith("Hi Priya Mehta")

    bad = client.put(f"{URL}support.reply/", {"subject": "x", "body": "{% if 1 %}{{ ticket_url }}{% endif %}"}, format="json")
    assert bad.status_code == 400 and "body" in bad.json()["error"]["details"]

    saved = client.put(f"{URL}support.reply/", {"subject": "Update on {{ ticket_reference }}", "body": "Hello {{ name }}: {{ ticket_url }}"}, format="json").json()
    assert saved["is_custom"] and saved["is_active"] and saved["updated_by_name"] == user.full_name
    entry = AuditLog.objects.get(action="email_template.updated")
    assert entry.scope == "platform" and entry.changes["body"] == {"from": "[redacted]", "to": "[redacted]"}

    # Test email goes only to the requesting admin, whatever the payload says.
    sent = client.post(f"{URL}support.reply/test/", {"to": "victim@example.com"}, format="json")
    assert sent.status_code == 202 and sent.json()["sent_to"] == "root@example.com"
    assert [m.to for m in mail.outbox] == [["root@example.com"]] and mail.outbox[0].subject.startswith("[Test] Update on TKT-1001")

    assert client.delete(f"{URL}support.reply/").status_code == 204
    assert not EmailTemplate.objects.filter(key="support.reply").exists()
    assert client.get(f"{URL}nope/").status_code == 404


def test_only_super_admin_can_manage_templates(make_user, make_business, client_for):
    support_admin = client_for(make_user(platform_role="support_admin"))
    business = make_business()
    owner = client_for(owner_of(business), business)
    for client in (support_admin, owner):
        assert client.get(URL).status_code == 403
        assert client.put(f"{URL}support.reply/", {"subject": "x", "body": "{{ ticket_url }}"}, format="json").status_code == 403
        assert client.post(f"{URL}support.reply/test/", {}, format="json").status_code == 403
    assert len(mail.outbox) == 0 and not EmailTemplate.objects.exists()
