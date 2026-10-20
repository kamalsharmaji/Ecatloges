from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit_logs import services as audit
from apps.audit_logs.models import AppendOnlyError, AuditLog
from apps.enquiries.models import Customer, Enquiry
from conftest import PASSWORD, owner_of

ACTIVITY = "/api/v1/activity/"
PLATFORM = "/api/v1/admin/audit-logs/"


@pytest.fixture
def biz(make_business, owner_client):
    business = make_business()
    return business, owner_client(business)


def actions(business):
    return list(AuditLog.objects.filter(business=business).order_by("id").values_list("action", flat=True))


# --- Recording ---------------------------------------------------------------------------------------
def test_catalogue_lifecycle_is_recorded_with_actor_and_changes(biz):
    business, client = biz
    created = client.post("/api/v1/catalogues/", {"name": "Summer"}, format="json").json()
    client.patch(f"/api/v1/catalogues/{created['id']}/", {"tagline": "Hot deals"}, format="json")
    client.post(f"/api/v1/catalogues/{created['id']}/publish/")
    client.post(f"/api/v1/catalogues/{created['id']}/archive/")
    assert client.delete(f"/api/v1/catalogues/{created['id']}/").status_code == 204

    assert actions(business) == [
        "catalogue.created", "catalogue.updated", "catalogue.published", "catalogue.archived", "catalogue.deleted",
    ]
    published = AuditLog.objects.get(action="catalogue.published")
    assert published.actor == owner_of(business) and published.target_label == "Summer"
    assert published.changes["status"] == {"from": "draft", "to": "published"}
    assert AuditLog.objects.get(action="catalogue.updated").changes == {"tagline": {"from": "", "to": "Hot deals"}}


def test_product_category_and_bulk_actions(biz, make_category):
    business, client = biz
    category = make_category(business, name="Sofas")
    product = client.post("/api/v1/products/", {
        "name": "Sofa", "short_description": "Nice", "category_id": str(category.id), "price": "100.00",
    }, format="json").json()
    client.patch(f"/api/v1/products/{product['id']}/", {"price": "120.00"}, format="json")
    client.post("/api/v1/products/bulk/", {"ids": [product["id"]], "action": "publish"}, format="json")
    client.patch(f"/api/v1/categories/{category.id}/", {"name": "Couches"}, format="json")

    assert actions(business) == ["product.created", "product.updated", "product.bulk_publish", "category.updated"]
    assert AuditLog.objects.get(action="product.updated").changes["price"] == {"from": "100.00", "to": "120.00"}
    assert AuditLog.objects.get(action="category.updated").changes["name"] == {"from": "Sofas", "to": "Couches"}


def test_sensitive_values_are_redacted(make_user):
    user = make_user()
    entry = audit.record(
        "test.event", actor=user,
        changes={"password": {"from": "old", "to": "new"}, "price": {"from": 1, "to": 2}},
        metadata={"api_key": "sk_live_123", "token": "abc", "email": "a@b.c", "count": 3, "nested": {"secret": "x"}},
    )
    entry.refresh_from_db()
    assert entry.changes["password"] == {"from": "[redacted]", "to": "[redacted]"}
    assert entry.changes["price"] == {"from": 1, "to": 2}
    assert entry.metadata == {
        "api_key": "[redacted]", "token": "[redacted]", "email": "[redacted]", "count": 3,
        "nested": {"secret": "[redacted]"},
    }


def test_customer_contact_and_enquiry_notes_never_stored(biz):
    business, client = biz
    customer = client.post("/api/v1/customers/", {"name": "Ravi", "phone": "+91 98765 43210"}, format="json").json()
    client.patch(f"/api/v1/customers/{customer['id']}/", {"phone": "+91 90000 11111", "city": "Pune"}, format="json")
    entry = AuditLog.objects.get(action="customer.updated")
    assert entry.changes["phone"] == {"from": "[redacted]", "to": "[redacted]"}
    assert entry.changes["city"] == {"from": "", "to": "Pune"}
    assert entry.target_label.startswith("Customer ") and "Ravi" not in entry.target_label

    enquiry = Enquiry.objects.create(business=business, name="Ravi", phone="+919876543210", message="Secret plans")
    client.patch(f"/api/v1/enquiries/{enquiry.id}/", {"status": "contacted", "internal_notes": "VIP, call at 5"}, format="json")
    entry = AuditLog.objects.get(action="enquiry.status_changed")
    assert entry.changes["status"] == {"from": "new", "to": "contacted"}
    assert entry.changes["internal_notes"] == {"from": "[redacted]", "to": "[redacted]"}
    dump = str(list(AuditLog.objects.values()))
    for secret in ("98765", "90000", "Secret plans", "VIP", "Ravi"):
        assert secret not in dump


def test_login_records_security_event_without_secrets(make_user):
    user = make_user(email="sec@example.com")
    response = APIClient().post("/api/v1/auth/login/", {"email": "sec@example.com", "password": PASSWORD}, format="json")
    assert response.status_code == 200
    entry = AuditLog.objects.get(action="auth.login")
    assert entry.scope == "account" and entry.actor == user and entry.business is None
    assert PASSWORD not in str(entry.metadata) + str(entry.changes)
    APIClient().post("/api/v1/auth/login/", {"email": "sec@example.com", "password": "wrong"}, format="json")
    assert AuditLog.objects.filter(action="auth.login").count() == 1


def test_entries_are_append_only(make_user):
    entry = audit.record("test.event", actor=make_user())
    entry.action = "tampered"
    with pytest.raises(AppendOnlyError):
        entry.save()
    with pytest.raises(AppendOnlyError):
        entry.delete()


# --- Business Activity Log API -----------------------------------------------------------------------
def test_activity_log_is_isolated_and_permissioned(make_business, add_member, client_for):
    a, b = make_business(), make_business()
    audit.record("catalogue.created", business=a, actor=owner_of(a), target_type="catalogue", target_label="A1")
    audit.record("catalogue.created", business=b, actor=owner_of(b), target_type="catalogue", target_label="B1")
    audit.record("auth.login", actor=owner_of(a), scope="account")  # never in a business log

    owner_a = client_for(owner_of(a), a)
    data = owner_a.get(ACTIVITY).json()
    assert [r["target_label"] for r in data["results"]] == ["A1"]
    entry_b = AuditLog.objects.get(target_label="B1")
    assert owner_a.get(f"{ACTIVITY}{entry_b.id}/").status_code == 404
    assert client_for(owner_of(b), a).get(ACTIVITY).status_code == 404  # foreign X-Business-ID

    staff = add_member(a, "staff").user
    assert client_for(staff, a).get(ACTIVITY).status_code == 403
    viewer = add_member(a, "viewer").user  # all *.view, including audit_log.view
    assert client_for(viewer, a).get(ACTIVITY).status_code == 200
    # Read-only through the API.
    entry_a = AuditLog.objects.get(target_label="A1")
    assert owner_a.delete(f"{ACTIVITY}{entry_a.id}/").status_code in (403, 405)
    assert owner_a.patch(f"{ACTIVITY}{entry_a.id}/", {"action": "x"}, format="json").status_code in (403, 405)
    assert AuditLog.objects.filter(pk=entry_a.pk, action="catalogue.created").exists()


def test_activity_log_filters_search_and_pagination(make_business, add_member, client_for):
    business = make_business()
    owner = owner_of(business)
    other = add_member(business, "manager").user
    for i in range(3):
        audit.record("product.created", business=business, actor=owner, target_type="product", target_label=f"Chair {i}")
    audit.record("catalogue.published", business=business, actor=other, target_type="catalogue", target_label="Spring")
    old = audit.record("catalogue.created", business=business, actor=owner, target_label="Old")
    AuditLog.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=40))
    client = client_for(owner, business)

    assert client.get(ACTIVITY, {"module": "product"}).json()["count"] == 3
    assert client.get(ACTIVITY, {"action": "catalogue.published"}).json()["count"] == 1
    assert client.get(ACTIVITY, {"actor": str(other.id)}).json()["count"] == 1
    assert client.get(ACTIVITY, {"search": "spring"}).json()["count"] == 1
    since = (timezone.now() - timedelta(days=7)).date().isoformat()
    assert client.get(ACTIVITY, {"created_from": since}).json()["count"] == 4
    page = client.get(ACTIVITY, {"page_size": 2}).json()
    assert page["count"] == 5 and len(page["results"]) == 2
    options = client.get(f"{ACTIVITY}filters/").json()
    assert {"catalogue", "product"} <= set(options["modules"]) and len(options["actors"]) == 2


def test_platform_admin_action_shows_as_team_to_business(make_business, make_user, client_for):
    business = make_business()
    admin = make_user(platform_role="super_admin", full_name="Asha Admin")
    audit.record_platform(admin, "subscription.cancelled", business=business, scope="business", target_label="Pro")
    row = client_for(owner_of(business), business).get(ACTIVITY).json()["results"][0]
    assert row["actor_name"] == "myEcatalogues team" and row["actor_type"] == "platform_admin"
    platform_row = client_for(admin).get(PLATFORM).json()["results"][0]
    assert platform_row["actor_name"] == "Asha Admin"


# --- Platform audit log ------------------------------------------------------------------------------
def test_platform_audit_log_is_super_admin_only(make_business, make_user, client_for):
    a, b = make_business(), make_business()
    audit.record("catalogue.created", business=a, actor=owner_of(a))
    audit.record("catalogue.created", business=b, actor=owner_of(b))
    audit.record("auth.login", actor=owner_of(a), scope="account")

    super_admin = client_for(make_user(platform_role="super_admin"))
    assert super_admin.get(PLATFORM).json()["count"] == 3
    assert super_admin.get(PLATFORM, {"business": str(a.id)}).json()["count"] == 1
    assert super_admin.get(PLATFORM, {"scope": "account"}).json()["count"] == 1
    assert client_for(make_user(platform_role="support_admin")).get(PLATFORM).status_code == 403
    assert client_for(owner_of(a), a).get(PLATFORM).status_code == 403


def test_admin_plan_changes_are_audited(make_user, client_for, make_plan):
    admin = make_user(platform_role="super_admin")
    plan = make_plan(name="Gold")
    response = client_for(admin).patch(f"/api/v1/admin/plans/{plan.id}/", {"is_active": False}, format="json")
    assert response.status_code == 200, response.content
    entry = AuditLog.objects.get(action="plan.updated")
    assert entry.scope == "platform" and entry.actor_type == "platform_admin"
    assert entry.changes == {"is_active": {"from": True, "to": False}}


def test_team_and_role_changes_are_audited(make_business, add_member, client_for):
    business = make_business()
    client = client_for(owner_of(business), business)
    member = add_member(business, "staff")
    from apps.businesses.services import system_role

    client.patch(f"/api/v1/members/{member.id}/", {"role_id": str(system_role("manager").id)}, format="json")
    entry = AuditLog.objects.get(action="member.role_changed")
    assert entry.changes == {"role": {"from": "Staff", "to": "Manager"}}
    role = client.post("/api/v1/roles/", {"name": "Packers", "permissions": ["product.view"]}, format="json").json()
    client.patch(f"/api/v1/roles/{role['id']}/", {"permissions": ["product.view", "catalogue.view"]}, format="json")
    updated = AuditLog.objects.get(action="role.updated")
    assert updated.changes["permissions_added"]["to"] == ["catalogue.view"]
    assert Customer.objects.count() == 0  # sanity: nothing else touched
