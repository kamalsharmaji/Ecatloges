import pytest

from apps.products.models import Category, Product

pytestmark = pytest.mark.django_db
URL = "/api/v1/categories/"


def test_crud_and_counts(make_business, owner_client, make_product):
    business = make_business()
    client = owner_client(business)
    created = client.post(URL, {"name": "  Furniture ", "description": "Chairs and more", "icon": "sofa"}, format="json")
    assert created.status_code == 201, created.content
    body = created.json()
    assert body["name"] == "Furniture" and body["icon"] == "sofa" and body["product_count"] == 0
    cat_id = body["id"]
    child = client.post(URL, {"name": "Sofa Sets", "parent_id": cat_id}, format="json").json()
    assert child["path"] == ["Furniture", "Sofa Sets"]
    make_product(business, category=Category.objects.get(pk=cat_id))

    listing = client.get(URL, {"top_level": "true"}).json()
    row = listing["results"][0]
    assert listing["count"] == 1 and row["product_count"] == 1 and row["children_count"] == 1
    assert client.patch(f"{URL}{cat_id}/", {"status": "draft", "sort_order": 3}, format="json").json()["status"] == "draft"
    summary = client.get(f"{URL}summary/").json()
    assert summary == {"total": 2, "with_products": 1, "subcategories": 1, "total_products": 1}


@pytest.mark.parametrize("name", ["furniture", "FURNITURE", " Furniture "])
def test_duplicate_names_are_rejected_case_insensitively(make_business, owner_client, make_category, name):
    business = make_business()
    make_category(business, name="Furniture")
    response = owner_client(business).post(URL, {"name": name}, format="json")
    assert response.status_code == 400 and "name" in response.json()["error"]["details"]


def test_same_name_allowed_in_another_business(make_business, owner_client, make_category):
    make_category(make_business(), name="Furniture")
    assert owner_client(make_business()).post(URL, {"name": "Furniture"}, format="json").status_code == 201


@pytest.mark.parametrize("payload", [{"name": ""}, {"name": "x" * 101}, {"name": "Ok", "icon": "rocket-ship"}])
def test_invalid_category_input(make_business, owner_client, payload):
    response = owner_client(make_business()).post(URL, payload, format="json")
    assert response.status_code == 400


def test_cycles_and_depth_are_prevented(make_business, owner_client, make_category):
    business = make_business()
    a = make_category(business, name="A")
    b = make_category(business, name="B", parent=a)
    c = make_category(business, name="C", parent=b)
    client = owner_client(business)
    assert client.patch(f"{URL}{a.id}/", {"parent_id": str(c.id)}, format="json").status_code == 400  # cycle
    assert client.patch(f"{URL}{a.id}/", {"parent_id": str(a.id)}, format="json").status_code == 400  # self
    assert client.post(URL, {"name": "D", "parent_id": str(c.id)}, format="json").status_code == 400  # depth 4


def test_delete_with_products_requires_reassignment(make_business, owner_client, make_category, make_product):
    business = make_business()
    old, new = make_category(business, name="Old"), make_category(business, name="New")
    product = make_product(business, category=old)
    client = owner_client(business)
    blocked = client.delete(f"{URL}{old.id}/")
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "category_in_use"
    assert client.delete(f"{URL}{old.id}/?reassign_to={new.id}").status_code == 204
    product.refresh_from_db()
    assert product.category_id == new.id and not Category.objects.filter(pk=old.pk).exists()


def test_delete_with_subcategories_is_blocked(make_business, owner_client, make_category):
    business = make_business()
    parent = make_category(business)
    make_category(business, parent=parent)
    response = owner_client(business).delete(f"{URL}{parent.id}/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "category_has_children"


def test_empty_category_can_be_deleted(make_business, owner_client, make_category):
    business = make_business()
    category = make_category(business)
    assert owner_client(business).delete(f"{URL}{category.id}/").status_code == 204


def test_tenant_isolation(make_business, owner_client, make_category, make_product):
    a, b = make_business(), make_business()
    b_cat = make_category(b, name="Bravo only")
    make_product(b, category=b_cat)
    client = owner_client(a)
    assert client.get(f"{URL}{b_cat.id}/").status_code == 404
    assert client.patch(f"{URL}{b_cat.id}/", {"name": "x"}, format="json").status_code == 404
    assert client.delete(f"{URL}{b_cat.id}/").status_code == 404
    assert client.get(URL).json()["count"] == 0
    # Cannot use another tenant's category as parent, or as a reassignment target.
    assert client.post(URL, {"name": "Child", "parent_id": str(b_cat.id)}, format="json").status_code == 400
    own = make_category(a)
    make_product(a, category=own)
    assert client.delete(f"{URL}{own.id}/?reassign_to={b_cat.id}").status_code == 400
    assert Product.objects.filter(category=b_cat).count() == 1


def test_rbac(make_business, add_member, client_for, make_category):
    business = make_business()
    category = make_category(business)
    viewer = client_for(add_member(business, "viewer").user, business)
    staff = client_for(add_member(business, "staff").user, business)
    assert viewer.get(URL).status_code == 200
    assert viewer.post(URL, {"name": "x"}, format="json").status_code == 403
    assert staff.post(URL, {"name": "Staff made"}, format="json").status_code == 201
    assert staff.delete(f"{URL}{category.id}/").status_code == 403  # staff cannot delete


def test_writes_require_active_subscription(make_business, owner_client, make_category):
    business = make_business(subscribed=False)
    response = owner_client(business).post(URL, {"name": "x"}, format="json")
    assert response.status_code == 402 and response.json()["error"]["code"] == "subscription_required"
    category = make_category(business)
    assert owner_client(business).get(URL).status_code == 200  # reading stays possible
    assert owner_client(business).delete(f"{URL}{category.id}/").status_code == 204  # cleanup allowed
