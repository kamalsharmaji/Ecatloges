"""
Concurrent requests must not exceed plan limits. Needs real row locks, so it only runs on
PostgreSQL (SQLite serialises writers differently and is skipped).
"""
import threading

import pytest
from django.db import close_old_connections, connection

from apps.catalogues.models import Catalogue
from apps.products.models import Product
from conftest import activate_subscription, owner_of

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.skipif("connection.vendor != 'postgresql'", reason="row-level locking needs PostgreSQL"),
]


def _race(n, fn):
    barrier = threading.Barrier(n)
    results = []

    def worker():
        try:
            barrier.wait()
            results.append(fn())
        finally:
            close_old_connections()

    threads = [threading.Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def test_parallel_catalogue_creation_respects_limit(make_business, make_plan, client_for):
    assert connection.vendor == "postgresql"
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_catalogues=2))
    owner = owner_of(business)
    statuses = _race(
        6, lambda: client_for(owner, business).post("/api/v1/catalogues/", {"name": "Race"}, format="json").status_code
    )
    assert sorted(statuses) == [201, 201, 402, 402, 402, 402]
    assert Catalogue.objects.filter(business=business).count() == 2


def test_parallel_product_creation_respects_limit(make_business, make_plan, make_category, client_for):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(max_products=3))
    category = make_category(business)
    owner = owner_of(business)
    payload = {"name": "Race", "short_description": "x", "category_id": str(category.id)}
    statuses = _race(8, lambda: client_for(owner, business).post("/api/v1/products/", payload, format="json").status_code)
    assert statuses.count(201) == 3 and statuses.count(402) == 5
    assert Product.objects.filter(business=business).count() == 3
