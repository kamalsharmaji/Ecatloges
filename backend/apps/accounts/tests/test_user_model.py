import pytest
from django.db import IntegrityError

from apps.accounts.models import PlatformRole, User

pytestmark = pytest.mark.django_db


def test_create_user_normalises_email_and_hashes_password():
    user = User.objects.create_user(email="Owner@Example.COM", password="S3cure-pass!", full_name="Asha")
    assert user.email == "owner@example.com"
    assert user.check_password("S3cure-pass!")
    assert user.password != "S3cure-pass!"
    assert not user.is_staff and not user.is_superuser
    assert not user.is_email_verified
    assert not user.is_platform_admin


def test_email_is_unique_case_insensitively():
    User.objects.create_user(email="dup@example.com", password="S3cure-pass!", full_name="A")
    with pytest.raises(IntegrityError):
        # Bypass save() normalisation to prove the database constraint itself holds.
        User.objects.bulk_create([User(email="DUP@example.com", full_name="B")])


def test_login_lookup_is_case_insensitive():
    User.objects.create_user(email="case@example.com", password="S3cure-pass!", full_name="A")
    assert User.objects.get_by_natural_key("CASE@Example.com").email == "case@example.com"


def test_create_superuser_is_platform_super_admin():
    admin = User.objects.create_superuser(email="root@example.com", password="S3cure-pass!", full_name="Root")
    assert admin.is_superuser and admin.is_staff
    assert admin.platform_role == PlatformRole.SUPER_ADMIN
    assert admin.is_platform_super_admin and admin.is_platform_admin


def test_inactive_admin_has_no_platform_access():
    admin = User.objects.create_superuser(email="off@example.com", password="S3cure-pass!", full_name="Off")
    admin.is_active = False
    assert not admin.is_platform_admin


def test_mark_email_verified_sets_timestamp():
    user = User.objects.create_user(email="v@example.com", password="S3cure-pass!", full_name="V")
    user.mark_email_verified()
    user.refresh_from_db()
    assert user.is_email_verified and user.email_verified_at is not None
