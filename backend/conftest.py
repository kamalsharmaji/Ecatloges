"""Shared pytest fixtures. Every test builds its own isolated users and businesses."""
import itertools

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import issue_tokens
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
def make_business(db, make_user):
    def _make(owner=None, name=None, **extra):
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


def owner_of(business) -> User:
    """The original owner (creator) of a business built by `make_business`."""
    return business.created_by
