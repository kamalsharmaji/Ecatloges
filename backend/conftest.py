"""Shared pytest fixtures. Every test builds its own isolated users and businesses."""
import itertools
from decimal import Decimal

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import issue_tokens
from apps.billing.models import Plan, Subscription, add_interval
from apps.businesses.models import Business, BusinessMembership
from apps.rbac.models import Role

PASSWORD = "Str0ng-Passw0rd!"
_seq = itertools.count(1)


@pytest.fixture(autouse=True)
def _clear_cache():
    # Throttle counters live in the cache; never leak them between tests.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def make_user(db):
    def _make(email=None, **extra):
        n = next(_seq)
        extra.setdefault("full_name", f"User {n}")
        return User.objects.create_user(email=email or f"user{n}@example.com", password=PASSWORD, **extra)

    return _make


def system_role(key: str) -> Role:
    return Role.objects.get(key=key, business__isnull=True)


@pytest.fixture
def make_plan(db):
    def _make(**fields):
        n = next(_seq)
        defaults = dict(
            code=f"test-plan-{n}",
            name=f"Test Plan {n}",
            price=Decimal("1000.00"),
            currency="INR",
            interval="month",
            tier_rank=1,
            max_staff=50,
        )
        defaults.update(fields)
        return Plan.objects.create(**defaults)

    return _make


def activate_subscription(business, plan, *, start=None) -> Subscription:
    """Directly create an active subscription (test setup only — production goes through payments)."""
    start = start or timezone.now()
    return Subscription.objects.create(
        business=business,
        status=Subscription.Status.ACTIVE,
        current_period_start=start,
        current_period_end=add_interval(start, plan.interval),
        activated_at=start,
        **Subscription.snapshot_fields(plan),
    )


@pytest.fixture
def make_business(db, make_user, make_plan):
    """By default the business has an active subscription, like any business using the panel."""

    def _make(owner=None, name=None, subscribed=True, **extra):
        owner = owner or make_user()
        n = next(_seq)
        business = Business.objects.create(
            name=name or f"Business {n}",
            slug=f"business-{n}",
            owner_name=owner.full_name,
            phone="+91 98765 43210",
            email=f"biz{n}@example.com",
            category="retail",
            address_line1="1 Main Street",
            city="Mumbai",
            created_by=owner,
            **extra,
        )
        BusinessMembership.objects.create(business=business, user=owner, role=system_role("owner"))
        if subscribed:
            activate_subscription(business, make_plan())
        return business

    return _make


@pytest.fixture
def add_member(db, make_user):
    def _add(business, role="staff", user=None, status=BusinessMembership.Status.ACTIVE):
        role_obj = role if isinstance(role, Role) else system_role(role)
        return BusinessMembership.objects.create(
            business=business, user=user or make_user(), role=role_obj, status=status
        )

    return _add


@pytest.fixture
def client_for():
    """APIClient authenticated as `user`, optionally scoped to `business` via X-Business-ID."""

    def _client(user, business=None):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user)['access']}")
        if business is not None:
            client.defaults["HTTP_X_BUSINESS_ID"] = str(business.id)
        return client

    return _client


# --- Phase 5: catalogue content -----------------------------------------------------------------
def image_bytes(fmt="PNG", size=(64, 48), color=(30, 90, 200)) -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, fmt)
    return buf.getvalue()


def mp4_bytes(duration_seconds=12, timescale=1000, pad=0) -> bytes:
    """A minimal ISO-BMFF file: ftyp + moov/mvhd (enough for type detection and duration)."""
    import struct

    ftyp = struct.pack(">I4s4sI4s4s", 24, b"ftyp", b"isom", 512, b"isom", b"mp41")
    mvhd_payload = bytes([0, 0, 0, 0]) + struct.pack(">IIII", 0, 0, timescale, duration_seconds * timescale) + bytes(80)
    mvhd = struct.pack(">I4s", 8 + len(mvhd_payload), b"mvhd") + mvhd_payload
    moov = struct.pack(">I4s", 8 + len(mvhd), b"moov") + mvhd
    mdat = struct.pack(">I4s", 8 + pad, b"mdat") + bytes(pad)
    return ftyp + moov + mdat


def upload(name: str, content: bytes, content_type="application/octet-stream"):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, content, content_type=content_type)


@pytest.fixture
def make_category(db):
    def _make(business, name=None, **extra):
        from apps.products.models import Category

        return Category.objects.create(business=business, name=name or f"Category {next(_seq)}", **extra)

    return _make


@pytest.fixture
def make_product(db, make_category):
    def _make(business, category=None, **extra):
        from apps.products.models import Product

        extra.setdefault("name", f"Product {next(_seq)}")
        extra.setdefault("short_description", "A product")
        return Product.objects.create(business=business, category=category or make_category(business), **extra)

    return _make


@pytest.fixture
def make_catalogue(db):
    def _make(business, name=None, products=(), **extra):
        from apps.catalogues.models import Catalogue, CatalogueItem

        n = next(_seq)
        catalogue = Catalogue.objects.create(business=business, name=name or f"Catalogue {n}", slug=f"catalogue-{n}", **extra)
        for i, product in enumerate(products):
            CatalogueItem.objects.create(catalogue=catalogue, product=product, position=i)
        return catalogue

    return _make


@pytest.fixture
def owner_client(client_for):
    def _client(business):
        return client_for(owner_of(business), business)

    return _client


def owner_of(business) -> User:
    """The original owner (creator) of a business built by `make_business`."""
    return business.created_by
