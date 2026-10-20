from decimal import Decimal

import pytest
from django.test import override_settings

from apps.catalogues.models import CatalogueItem
from apps.media_library.models import MediaAsset
from apps.products.models import Product, ProductMedia
from conftest import activate_subscription, owner_of

pytestmark = pytest.mark.django_db
URL = "/api/v1/products/"


def payload(category, **extra):
    data = {"name": "Modern 3 Seater Sofa", "short_description": "Stylish sofa", "category_id": str(category.id)}
    data.update(extra)
    return data


def make_asset(business, kind="image", n=0):
    return MediaAsset.objects.create(
        business=business, kind=kind, original=f"x/{n}.png", original_filename=f"{n}.png", extension="png",
        mime_type="image/png", size_bytes=10, sha256="0" * 64,
    )


# --- CRUD, optional fields, validation --------------------------------------------------------
def test_create_minimal_product_price_and_moq_optional(make_business, owner_client, make_category):
    business = make_business()
    response = owner_client(business).post(URL, payload(make_category(business)), format="json")
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["status"] == "draft" and body["price"] is None and body["moq"] is None
    assert body["media"] == [] and body["catalogues"] == []


def test_full_product_with_media_and_catalogues(make_business, owner_client, make_category, make_catalogue):
    business = make_business()
    assets = [make_asset(business, n=i) for i in range(3)]
    cat_a, cat_b = make_catalogue(business), make_catalogue(business)
    data = payload(
        make_category(business),
        sku="SF-001", price="28999.00", compare_at_price="34999.00", moq=5, moq_unit="sets", stock_status="made_to_order",
        tags=["Sofa", "sofa", " 3 Seater "], highlights=["Premium fabric", ""], is_featured=True, show_price=False,
        media_ids=[str(assets[2].id), str(assets[0].id)], catalogue_ids=[str(cat_a.id), str(cat_b.id)],
        description="Long text",
    )
    response = owner_client(business).post(URL, data, format="json")
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["tags"] == ["Sofa", "3 Seater"] and body["highlights"] == ["Premium fabric"]
    assert [m["id"] for m in body["media"]] == [str(assets[2].id), str(assets[0].id)]  # order kept; first = main
    assert {c["id"] for c in body["catalogues"]} == {str(cat_a.id), str(cat_b.id)}
    assert body["price"] == "28999.00" and body["moq"] == 5 and body["show_price"] is False


@pytest.mark.parametrize(
    ("extra", "field"),
    [
        ({"name": "  "}, "name"),
        ({"short_description": ""}, "short_description"),
        ({"price": "-1"}, "price"),
        ({"moq": 0}, "moq"),
        ({"price": "100", "compare_at_price": "50"}, "compare_at_price"),
        ({"currency": "EUR"}, "currency"),
        ({"stock_status": "plenty"}, "stock_status"),
        ({"tags": ["x" * 31]}, "tags"),
    ],
)
def test_validation(make_business, owner_client, make_category, extra, field):
    business = make_business()
    response = owner_client(business).post(URL, payload(make_category(business), **extra), format="json")
    assert response.status_code == 400 and field in response.json()["error"]["details"], response.content


def test_category_is_required(make_business, owner_client):
    response = owner_client(make_business()).post(URL, {"name": "x", "short_description": "y"}, format="json")
    assert response.status_code == 400 and "category_id" in response.json()["error"]["details"]


def test_sku_unique_per_business_case_insensitive(make_business, owner_client, make_category, make_product):
    business = make_business()
    make_product(business, sku="SF-001")
    response = owner_client(business).post(URL, payload(make_category(business), sku="sf-001"), format="json")
    assert response.status_code == 400 and "sku" in response.json()["error"]["details"]
    other = make_business()
    assert owner_client(other).post(URL, payload(make_category(other), sku="SF-001"), format="json").status_code == 201


@override_settings(MEDIA_MAX_ITEMS_PER_PRODUCT=2)
def test_media_per_product_cap(make_business, owner_client, make_category):
    business = make_business()
    ids = [str(make_asset(business, n=i).id) for i in range(3)]
    response = owner_client(business).post(URL, payload(make_category(business), media_ids=ids), format="json")
    assert response.status_code == 400 and "media_ids" in response.json()["error"]["details"]
    assert not Product.objects.exists()  # nothing half-created


def test_update_replaces_media_order_and_catalogues(make_business, owner_client, make_product, make_catalogue):
    business = make_business()
    product = make_product(business)
    a, b = make_asset(business, n=1), make_asset(business, n=2)
    keep, drop = make_catalogue(business, products=[product]), make_catalogue(business, products=[product])
    client = owner_client(business)
    response = client.patch(
        f"{URL}{product.id}/", {"media_ids": [str(b.id), str(a.id)], "catalogue_ids": [str(keep.id)]}, format="json"
    )
    assert response.status_code == 200
    assert list(ProductMedia.objects.filter(product=product).values_list("asset_id", flat=True)) == [b.id, a.id]
    assert set(CatalogueItem.objects.filter(product=product).values_list("catalogue_id", flat=True)) == {keep.id}
    assert MediaAsset.objects.filter(pk=a.pk).exists()  # removing from a product never deletes the file


def test_status_lifecycle_and_duplicate(make_business, owner_client, make_product):
    business = make_business()
    product = make_product(business, sku="X-1")
    client = owner_client(business)
    assert client.post(f"{URL}{product.id}/publish/").json()["status"] == "published"
    product.refresh_from_db()
    assert product.published_at is not None
    assert client.post(f"{URL}{product.id}/unpublish/").json()["status"] == "draft"
    assert client.post(f"{URL}{product.id}/archive/").json()["status"] == "archived"
    assert client.post(f"{URL}{product.id}/restore/").json()["status"] == "draft"
    copy = client.post(f"{URL}{product.id}/duplicate/")
    assert copy.status_code == 201
    assert copy.json()["name"].endswith("(copy)") and copy.json()["sku"] == "" and copy.json()["status"] == "draft"
    assert client.delete(f"{URL}{product.id}/").status_code == 204


# --- Listing ---------------------------------------------------------------------------------
def test_search_filters_sorting_pagination(make_business, owner_client, make_category, make_product, make_catalogue):
    business = make_business()
    furniture = make_category(business, name="Furniture")
    sofas = make_category(business, name="Sofas", parent=furniture)
    lamps = make_category(business, name="Lamps")
    chair = make_product(business, category=furniture, name="Wooden Chair", sku="WC-1", price=Decimal("10"), status="published")
    sofa = make_product(business, category=sofas, name="Leather Sofa", price=Decimal("50"))
    lamp = make_product(business, category=lamps, name="Table Lamp", price=Decimal("30"), status="published")
    catalogue = make_catalogue(business, products=[lamp])
    client = owner_client(business)

    def ids(**params):
        return [r["id"] for r in client.get(URL, params).json()["results"]]

    assert ids(search="wc-1") == [str(chair.id)]
    assert set(ids(category=str(furniture.id))) == {str(chair.id), str(sofa.id)}  # includes subcategories
    assert set(ids(status="published")) == {str(chair.id), str(lamp.id)}
    assert ids(catalogue=str(catalogue.id)) == [str(lamp.id)]
    assert set(ids(exclude_catalogue=str(catalogue.id))) == {str(chair.id), str(sofa.id)}
    assert ids(ordering="price") == [str(chair.id), str(lamp.id), str(sofa.id)]
    page = client.get(URL, {"page_size": 2, "page": 2}).json()
    assert page["count"] == 3 and page["total_pages"] == 2 and len(page["results"]) == 1
    summary = client.get(f"{URL}summary/").json()
    assert summary["total"] == 3 and summary["published"] == 2 and summary["draft"] == 1


# --- Bulk actions ----------------------------------------------------------------------------
def test_bulk_actions(make_business, owner_client, make_product, make_catalogue):
    business = make_business()
    products = [make_product(business) for _ in range(3)]
    ids = [str(p.id) for p in products]
    catalogue = make_catalogue(business)
    client = owner_client(business)
    assert client.post(f"{URL}bulk/", {"ids": ids, "action": "publish"}, format="json").json() == {"updated": 3}
    assert Product.objects.filter(status="published").count() == 3
    client.post(f"{URL}bulk/", {"ids": ids[:2], "action": "add_to_catalogue", "catalogue_id": str(catalogue.id)}, format="json")
    assert catalogue.items.count() == 2
    client.post(f"{URL}bulk/", {"ids": ids[:1], "action": "remove_from_catalogue", "catalogue_id": str(catalogue.id)}, format="json")
    assert catalogue.items.count() == 1
    client.post(f"{URL}bulk/", {"ids": ids, "action": "archive"}, format="json")
    assert Product.objects.filter(status="archived").count() == 3
    client.post(f"{URL}bulk/", {"ids": ids, "action": "delete"}, format="json")
    assert not Product.objects.exists()


def test_bulk_rejects_foreign_ids_without_touching_anything(make_business, owner_client, make_product):
    a, b = make_business(), make_business()
    mine, theirs = make_product(a), make_product(b)
    response = owner_client(a).post(f"{URL}bulk/", {"ids": [str(mine.id), str(theirs.id)], "action": "delete"}, format="json")
    assert response.status_code == 404
    assert Product.objects.filter(pk__in=[mine.pk, theirs.pk]).count() == 2


# --- RBAC ------------------------------------------------------------------------------------
def test_rbac(make_business, add_member, client_for, make_category, make_product):
    business = make_business()
    category = make_category(business)
    product = make_product(business, category=category)
    viewer = client_for(add_member(business, "viewer").user, business)
    staff = client_for(add_member(business, "staff").user, business)
    assert viewer.get(URL).status_code == 200
    assert viewer.post(URL, payload(category), format="json").status_code == 403
    assert viewer.patch(f"{URL}{product.id}/", {"name": "x"}, format="json").status_code == 403
    # Staff can create & edit drafts but not publish or delete.
    assert staff.post(URL, payload(category), format="json").status_code == 201
    assert staff.post(URL, payload(category, status="published"), format="json").status_code == 403
    assert staff.patch(f"{URL}{product.id}/", {"status": "published"}, format="json").status_code == 403
    assert staff.post(f"{URL}{product.id}/publish/").status_code == 403
    assert staff.delete(f"{URL}{product.id}/").status_code == 403
    assert staff.post(f"{URL}bulk/", {"ids": [str(product.id)], "action": "publish"}, format="json").status_code == 403
    product.refresh_from_db()
    assert product.status == "draft"


# --- Tenant isolation ------------------------------------------------------------------------
def test_cross_business_access_is_impossible(make_business, owner_client, make_category, make_product, make_catalogue):
    a, b = make_business(), make_business()
    b_product = make_product(b, name="Bravo secret")
    b_asset = make_asset(b)
    b_catalogue = make_catalogue(b)
    client = owner_client(a)
    for method, url in (("get", f"{URL}{b_product.id}/"), ("delete", f"{URL}{b_product.id}/"),
                        ("post", f"{URL}{b_product.id}/publish/"), ("post", f"{URL}{b_product.id}/duplicate/")):
        assert getattr(client, method)(url).status_code == 404
    assert client.patch(f"{URL}{b_product.id}/", {"name": "pwned"}, format="json").status_code == 404
    assert client.get(URL).json()["count"] == 0
    # Foreign references in a payload are rejected.
    own_cat = make_category(a)
    for extra in ({"category_id": str(b_product.category_id)}, {"media_ids": [str(b_asset.id)]},
                  {"catalogue_ids": [str(b_catalogue.id)]}):
        response = client.post(URL, {**payload(own_cat), **extra}, format="json")
        assert response.status_code == 400, extra
    b_product.refresh_from_db()
    assert b_product.name == "Bravo secret" and not ProductMedia.objects.filter(asset=b_asset).exists()


# --- Plan limits -----------------------------------------------------------------------------
def test_product_limit_and_archive_restore_bypass(make_business, owner_client, make_category, make_plan, make_product):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_products=2))
    category = make_category(business)
    client = owner_client(business)
    first = client.post(URL, payload(category, name="One"), format="json").json()
    assert client.post(URL, payload(category, name="Two"), format="json").status_code == 201
    blocked = client.post(URL, payload(category, name="Three"), format="json")
    assert blocked.status_code == 402 and blocked.json()["error"]["code"] == "plan_limit_exceeded"
    # Archiving frees a slot; restoring re-checks the limit.
    client.post(f"{URL}{first['id']}/archive/")
    assert client.post(URL, payload(category, name="Three"), format="json").status_code == 201
    assert client.post(f"{URL}{first['id']}/restore/").status_code == 402
    assert client.patch(f"{URL}{first['id']}/", {"status": "draft"}, format="json").status_code == 402
    assert client.post(f"{URL}bulk/", {"ids": [first["id"]], "action": "restore"}, format="json").status_code == 402
    second = Product.objects.get(name="Two")
    assert client.post(f"{URL}{second.id}/duplicate/").status_code == 402
    assert Product.objects.exclude(status="archived").count() == 2


def test_expired_subscription_blocks_writes_but_allows_cleanup(make_business, owner_client, make_category, make_product):
    business = make_business(subscribed=False)
    product = make_product(business)
    client = owner_client(business)
    assert client.post(URL, payload(make_category(business)), format="json").status_code == 402
    assert client.patch(f"{URL}{product.id}/", {"name": "New"}, format="json").status_code == 402
    assert client.post(f"{URL}{product.id}/publish/").status_code == 402
    assert client.post(f"{URL}{product.id}/archive/").status_code == 200
    assert client.delete(f"{URL}{product.id}/").status_code == 204
    assert owner_of(business)  # owner still signed in and able to read
    assert client.get(URL).status_code == 200
