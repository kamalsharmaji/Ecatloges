import pytest

from apps.billing.models import Subscription
from apps.catalogues.models import Catalogue, CatalogueItem
from apps.media_library.models import MediaAsset
from conftest import activate_subscription

pytestmark = pytest.mark.django_db
URL = "/api/v1/catalogues/"


def asset(business, kind="image"):
    return MediaAsset.objects.create(
        business=business, kind=kind, original="x/c.png", original_filename="c.png", extension="png",
        mime_type="image/png", size_bytes=10, sha256="0" * 64,
    )


# --- CRUD & lifecycle ------------------------------------------------------------------------
def test_create_with_branding_and_generated_slug(make_business, owner_client):
    business = make_business()
    cover = asset(business)
    client = owner_client(business)
    response = client.post(
        URL,
        {"name": "Furniture Collection", "description": "Modern furniture", "tagline": "For modern living",
         "cover_id": str(cover.id), "theme_color": "#0f766e", "whatsapp_number": "+91 98765 43210", "show_prices": False},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["slug"] == "furniture-collection" and body["status"] == "draft"
    assert body["public_url"].endswith(f"/c/{business.slug}/furniture-collection")
    assert body["cover"]["id"] == str(cover.id) and body["product_count"] == 0
    second = client.post(URL, {"name": "Furniture Collection"}, format="json").json()
    assert second["slug"] == "furniture-collection-2"


@pytest.mark.parametrize(
    ("data", "field"),
    [({"name": ""}, "name"), ({"name": "x", "theme_color": "blue"}, "theme_color"),
     ({"name": "x", "whatsapp_number": "call me"}, "whatsapp_number"), ({"name": "x", "status": "live"}, "status")],
)
def test_validation(make_business, owner_client, data, field):
    response = owner_client(make_business()).post(URL, data, format="json")
    assert response.status_code == 400 and field in response.json()["error"]["details"]


def test_explicit_slug_must_be_unique_and_valid(make_business, owner_client, make_catalogue):
    business = make_business()
    existing = make_catalogue(business)
    client = owner_client(business)
    assert client.post(URL, {"name": "x", "slug": existing.slug}, format="json").status_code == 400
    other = make_catalogue(business)
    assert client.patch(f"{URL}{other.id}/", {"slug": existing.slug}, format="json").status_code == 400
    assert client.patch(f"{URL}{other.id}/", {"slug": "!!!"}, format="json").status_code == 400
    assert client.patch(f"{URL}{other.id}/", {"slug": "Summer Sale"}, format="json").json()["slug"] == "summer-sale"


def test_publish_unpublish_archive_restore_delete(make_business, owner_client, make_catalogue):
    business = make_business()
    catalogue = make_catalogue(business)
    client = owner_client(business)
    published = client.post(f"{URL}{catalogue.id}/publish/").json()
    assert published["status"] == "published" and published["published_at"]
    assert client.post(f"{URL}{catalogue.id}/unpublish/").json()["status"] == "draft"
    archived = client.post(f"{URL}{catalogue.id}/archive/").json()
    assert archived["status"] == "archived" and archived["archived_at"]
    restored = client.post(f"{URL}{catalogue.id}/restore/").json()
    assert restored["status"] == "draft" and restored["archived_at"] is None
    assert client.delete(f"{URL}{catalogue.id}/").status_code == 204
    assert not Catalogue.objects.filter(pk=catalogue.pk).exists()


def test_list_search_filter_sort_paginate_summary(make_business, owner_client, make_catalogue, make_product, make_category):
    business = make_business()
    lamps = make_category(business, name="Lamps")
    lamp = make_product(business, category=lamps)
    a = make_catalogue(business, name="Lighting & Lamps", products=[lamp], status="published")
    b = make_catalogue(business, name="Office Furniture", status="draft")
    make_catalogue(business, name="Old Stock", status="archived")
    client = owner_client(business)

    def names(**params):
        return [r["name"] for r in client.get(URL, params).json()["results"]]

    assert names(search="office") == ["Office Furniture"]
    assert names(status="published") == ["Lighting & Lamps"]
    assert names(category=str(lamps.id)) == ["Lighting & Lamps"]
    assert names(ordering="name") == ["Lighting & Lamps", "Office Furniture", "Old Stock"]
    rows = {r["name"]: r for r in client.get(URL).json()["results"]}
    assert rows["Lighting & Lamps"]["product_count"] == 1 and rows["Office Furniture"]["product_count"] == 0
    assert client.get(URL, {"page_size": 2}).json()["total_pages"] == 2
    summary = client.get(f"{URL}summary/").json()
    assert summary == {"total": 3, "published": 1, "draft": 1, "archived": 1, "limit": None}
    assert {a.id, b.id}


# --- Products inside a catalogue ---------------------------------------------------------------
def test_add_remove_reorder_items(make_business, owner_client, make_catalogue, make_product):
    business = make_business()
    p1, p2, p3 = (make_product(business, name=n) for n in ("One", "Two", "Three"))
    catalogue = make_catalogue(business)
    client = owner_client(business)
    added = client.post(f"{URL}{catalogue.id}/items/add/", {"product_ids": [str(p1.id), str(p2.id), str(p3.id)]}, format="json")
    assert added.json() == {"added": 3}
    assert client.post(f"{URL}{catalogue.id}/items/add/", {"product_ids": [str(p1.id)]}, format="json").json() == {"added": 0}
    client.post(f"{URL}{catalogue.id}/items/reorder/", {"product_ids": [str(p3.id), str(p1.id)]}, format="json")
    items = client.get(f"{URL}{catalogue.id}/items/").json()["results"]
    assert [i["name"] for i in items] == ["Three", "One", "Two"]
    assert client.post(f"{URL}{catalogue.id}/items/remove/", {"product_ids": [str(p1.id)]}, format="json").json() == {"removed": 1}
    assert CatalogueItem.objects.filter(catalogue=catalogue).count() == 2


def test_cannot_add_foreign_products_or_use_foreign_media(make_business, owner_client, make_catalogue, make_product):
    a, b = make_business(), make_business()
    catalogue = make_catalogue(a)
    foreign_product, foreign_asset = make_product(b), asset(b)
    client = owner_client(a)
    response = client.post(f"{URL}{catalogue.id}/items/add/", {"product_ids": [str(foreign_product.id)]}, format="json")
    assert response.status_code == 400 and not catalogue.items.exists()
    assert client.patch(f"{URL}{catalogue.id}/", {"cover_id": str(foreign_asset.id)}, format="json").status_code == 400
    video = asset(a, kind="video")
    assert client.patch(f"{URL}{catalogue.id}/", {"cover_id": str(video.id)}, format="json").status_code == 400


# --- Limits ----------------------------------------------------------------------------------
def test_catalogue_limit_and_restore_bypass(make_business, make_plan, owner_client):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_catalogues=1))
    client = owner_client(business)
    first = client.post(URL, {"name": "One"}, format="json").json()
    blocked = client.post(URL, {"name": "Two"}, format="json")
    assert blocked.status_code == 402 and blocked.json()["error"]["code"] == "plan_limit_exceeded"
    assert client.post(f"{URL}{first['id']}/archive/").status_code == 200
    second = client.post(URL, {"name": "Two"}, format="json")
    assert second.status_code == 201
    assert client.post(f"{URL}{first['id']}/restore/").status_code == 402
    assert client.patch(f"{URL}{first['id']}/", {"status": "published"}, format="json").status_code == 402
    assert Catalogue.objects.exclude(status="archived").count() == 1


def test_expired_subscription(make_business, owner_client, make_catalogue):
    business = make_business()
    catalogue = make_catalogue(business, status="published")
    Subscription.objects.filter(business=business).update(status="expired")
    client = owner_client(business)
    assert client.post(URL, {"name": "x"}, format="json").status_code == 402
    assert client.patch(f"{URL}{catalogue.id}/", {"name": "y"}, format="json").status_code == 402
    assert client.post(f"{URL}{catalogue.id}/unpublish/").status_code == 200  # taking content down is allowed
    assert client.post(f"{URL}{catalogue.id}/publish/").status_code == 402


def test_downgrade_quote_counts_catalogues(make_business, make_plan, owner_client, make_catalogue):
    """Phase 4 downgrade checks now see the Phase 5 usage counters."""
    from apps.billing.services import build_quote

    business = make_business()
    for _ in range(3):
        make_catalogue(business)
    small = make_plan(max_catalogues=2, tier_rank=0)
    quote = build_quote(business, small)
    assert any(b["code"] == "usage_exceeds_plan" for b in quote.blockers)


# --- RBAC & isolation ------------------------------------------------------------------------
def test_rbac(make_business, add_member, client_for, make_catalogue):
    business = make_business()
    catalogue = make_catalogue(business)
    viewer = client_for(add_member(business, "viewer").user, business)
    staff = client_for(add_member(business, "staff").user, business)
    manager = client_for(add_member(business, "catalogue_manager").user, business)
    assert viewer.get(URL).status_code == 200
    assert viewer.post(URL, {"name": "x"}, format="json").status_code == 403
    assert staff.post(URL, {"name": "Staff catalogue"}, format="json").status_code == 201
    assert staff.post(URL, {"name": "Live", "status": "published"}, format="json").status_code == 403
    assert staff.post(f"{URL}{catalogue.id}/publish/").status_code == 403
    assert staff.delete(f"{URL}{catalogue.id}/").status_code == 403
    assert manager.post(f"{URL}{catalogue.id}/publish/").status_code == 200
    assert manager.delete(f"{URL}{catalogue.id}/").status_code == 204


def test_tenant_isolation(make_business, owner_client, make_catalogue):
    a, b = make_business(), make_business()
    theirs = make_catalogue(b, name="Bravo")
    client = owner_client(a)
    for method, path in (("get", ""), ("delete", ""), ("post", "publish/"), ("post", "archive/"), ("get", "items/")):
        assert getattr(client, method)(f"{URL}{theirs.id}/{path}").status_code == 404
    assert client.patch(f"{URL}{theirs.id}/", {"name": "pwned"}, format="json").status_code == 404
    assert client.get(URL).json()["count"] == 0
    theirs.refresh_from_db()
    assert theirs.name == "Bravo" and theirs.status == "draft"
