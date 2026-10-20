"""Anonymous visitors only ever see published products in published catalogues of active, paying businesses."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.billing.models import Subscription
from apps.businesses.models import Business

pytestmark = pytest.mark.django_db


def base(business, catalogue):
    return f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/"


@pytest.fixture
def shop(make_business, make_category, make_product, make_catalogue):
    business = make_business(name="Sharma Furniture")
    sofas = make_category(business, name="Sofas")
    hidden_cat = make_category(business, name="Secret", status="draft")
    live = make_product(business, category=sofas, name="Live Sofa", sku="LS-1", price=Decimal("28999"), moq=2, status="published")
    draft = make_product(business, category=sofas, name="Draft Sofa", status="draft")
    archived = make_product(business, category=sofas, name="Old Sofa", status="archived")
    unassigned = make_product(business, category=sofas, name="Elsewhere", status="published")
    in_hidden = make_product(business, category=hidden_cat, name="Hidden cat product", status="published")
    catalogue = make_catalogue(
        business, name="Furniture", products=[live, draft, archived, in_hidden], status="published",
        whatsapp_number="+91 90000 11111",  # deliberately public; differs from the private business phone
    )
    return {"business": business, "catalogue": catalogue, "live": live, "draft": draft, "archived": archived,
            "unassigned": unassigned, "in_hidden": in_hidden}


def test_public_catalogue_shows_only_published_products(shop):
    api = APIClient()
    url = base(shop["business"], shop["catalogue"])
    page = api.get(url)
    assert page.status_code == 200, page.content
    body = page.json()
    assert body["name"] == "Furniture" and body["business"]["name"] == "Sharma Furniture"
    assert body["product_count"] == 2 and [c["name"] for c in body["categories"]] == ["Sofas"]  # draft category hidden
    products = api.get(f"{url}products/").json()
    names = {p["name"] for p in products["results"]}
    assert names == {"Live Sofa", "Hidden cat product"}
    live = next(p for p in products["results"] if p["name"] == "Live Sofa")
    assert live["price"] == "28999.00" and live["moq"] == 2
    # Detail works for visible products; everything else is a 404.
    assert api.get(f"{url}products/{shop['live'].id}/").status_code == 200
    for key in ("draft", "archived", "unassigned"):
        assert api.get(f"{url}products/{shop[key].id}/").status_code == 404


def test_public_payload_has_no_internal_data(shop):
    body = APIClient().get(base(shop["business"], shop["catalogue"])).json()
    text = str(body)
    for secret in ("owner_name", "email@", "created_by", "status", "sha256", "original", "business_id"):
        assert secret not in text
    business = shop["business"]
    assert business.email not in text and business.phone not in text


def test_search_and_category_filter(shop, make_category):
    url = base(shop["business"], shop["catalogue"]) + "products/"
    api = APIClient()
    assert [p["name"] for p in api.get(url, {"search": "ls-1"}).json()["results"]] == ["Live Sofa"]
    sofas = shop["live"].category_id
    assert [p["name"] for p in api.get(url, {"category": str(sofas)}).json()["results"]] == ["Live Sofa"]
    assert api.get(url, {"category": "not-a-uuid"}).json()["results"] == []


def test_prices_hidden_when_catalogue_or_product_says_so(shop, make_product):
    api = APIClient()
    url = base(shop["business"], shop["catalogue"]) + "products/"
    shop["catalogue"].show_prices = False
    shop["catalogue"].save()
    assert all(p["price"] is None for p in api.get(url).json()["results"])
    shop["catalogue"].show_prices = True
    shop["catalogue"].save()
    shop["live"].show_price = False
    shop["live"].save()
    assert api.get(f"{url}{shop['live'].id}/").json()["price"] is None


@pytest.mark.parametrize("change", ["draft", "archived", "suspended_business", "no_subscription", "wrong_business"])
def test_unavailable_catalogues_are_404(shop, make_business, change):
    business, catalogue = shop["business"], shop["catalogue"]
    if change in ("draft", "archived"):
        catalogue.status = change
        catalogue.save()
    elif change == "suspended_business":
        Business.objects.filter(pk=business.pk).update(status="suspended")
    elif change == "no_subscription":
        Subscription.objects.filter(business=business).update(status="expired")
    else:
        business = make_business()  # same catalogue slug under another business
    api = APIClient()
    assert api.get(base(business, catalogue)).status_code == 404
    assert api.get(base(business, catalogue) + "products/").status_code == 404


def test_public_endpoints_ignore_credentials(shop, client_for):
    """Being logged in as the owner does not reveal drafts on the public API."""
    from conftest import owner_of

    client = client_for(owner_of(shop["business"]), shop["business"])
    names = {p["name"] for p in client.get(base(shop["business"], shop["catalogue"]) + "products/").json()["results"]}
    assert "Draft Sofa" not in names
