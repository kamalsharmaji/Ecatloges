import pytest
from rest_framework.test import APIClient


@pytest.fixture
def storefront(make_business, make_category, make_product, make_catalogue):
    """A published catalogue with one published and one draft product."""
    business = make_business(name="Sharma Furniture")
    category = make_category(business)
    live = make_product(business, category=category, name="Wooden Chair", sku="WC-1", status="published")
    draft = make_product(business, category=category, name="Draft Chair", status="draft")
    catalogue = make_catalogue(business, name="Furniture", products=[live, draft], status="published")
    return {"business": business, "catalogue": catalogue, "live": live, "draft": draft}


def enquiry_url(business, catalogue):
    return f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/enquiries/"


def submit(shop, **overrides):
    data = {
        "name": "Amit Patel",
        "phone": "+91 98271 65432",
        "email": "Amit@Example.com",
        "message": "Please share the best price for 5 pieces.",
        "quantity": 5,
        "product_id": str(shop["live"].id),
        "elapsed_ms": 8000,
    }
    data.update(overrides)
    return APIClient().post(enquiry_url(shop["business"], shop["catalogue"]), data, format="json")
