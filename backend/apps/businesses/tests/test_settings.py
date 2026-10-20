import pytest
from rest_framework.test import APIClient

from apps.audit_logs.models import AuditLog
from apps.media_library.models import MediaAsset
from conftest import owner_of

URL = "/api/v1/business-settings/"


def image(business, **extra):
    return MediaAsset.objects.create(
        business=business, kind="image", folder="others", original=f"businesses/{business.pk}/x.png",
        original_filename="logo.png", extension="png", mime_type="image/png", size_bytes=10, sha256="0" * 64, **extra,
    )


@pytest.fixture
def biz(make_business, owner_client):
    business = make_business(name="Sharma Furniture")
    return business, owner_client(business)


def test_owner_reads_and_updates_settings_with_audit(biz):
    business, client = biz
    assert client.get(URL).json()["brand_color"] == "#1d4ed8"
    logo = image(business)
    r = client.patch(URL, {"brand_color": "#FF6600", "logo_id": str(logo.id), "default_show_prices": False,
                           "default_whatsapp_number": "+91 90000 11111"}, format="json")
    assert r.status_code == 200, r.content
    data = r.json()
    assert data["brand_color"] == "#ff6600" and data["logo"]["id"] == str(logo.id) and data["default_show_prices"] is False
    entry = AuditLog.objects.get(action="business.settings_updated")
    assert entry.changes["brand_color"] == {"from": "#1d4ed8", "to": "#ff6600"}
    assert entry.changes["default_whatsapp_number"] == {"from": "[redacted]", "to": "[redacted]"}


@pytest.mark.parametrize("payload", [
    {"brand_color": "red"},
    {"default_whatsapp_number": "call me"},
])
def test_validation(biz, payload):
    _, client = biz
    assert client.patch(URL, payload, format="json").status_code == 400


def test_logo_must_be_own_image(biz, make_business):
    business, client = biz
    foreign = image(make_business())
    video = image(business)
    MediaAsset.objects.filter(pk=video.pk).update(kind="video")
    for asset in (foreign, video):
        r = client.patch(URL, {"logo_id": str(asset.id)}, format="json")
        assert r.status_code == 400 and "logo_id" in r.json()["error"]["details"]


def test_permissions_and_isolation(biz, add_member, client_for, make_business):
    business, _ = biz
    manager = add_member(business, "manager").user  # business.view but not settings.update
    mgr = client_for(manager, business)
    assert mgr.get(URL).status_code == 200
    assert mgr.patch(URL, {"brand_color": "#000000"}, format="json").status_code == 403
    staff = client_for(add_member(business, "staff").user, business)
    assert staff.patch(URL, {"enquiry_email_enabled": False}, format="json").status_code == 403
    other = make_business()
    assert client_for(owner_of(other), business).get(URL).status_code == 404
    assert APIClient().get(URL).status_code == 401


@pytest.mark.parametrize("links,ok", [
    ({"instagram": "https://instagram.com/sharma"}, True),
    ({"x": "https://twitter.com/sharma", "youtube": "https://www.youtube.com/@sharma"}, True),
    ({"facebook": ""}, True),
    ({"instagram": "javascript:alert(1)"}, False),
    ({"instagram": "http://instagram.com/sharma"}, False),
    ({"facebook": "https://facebook.com.evil.example/x"}, False),
    ({"tiktok": "https://tiktok.com/@x"}, False),
])
def test_social_links_validation(biz, links, ok):
    business, client = biz
    r = client.patch(f"/api/v1/businesses/{business.id}/", {"social_links": links}, format="json")
    assert (r.status_code == 200) is ok, r.content


def test_catalogue_defaults_apply_when_omitted(biz):
    business, client = biz
    client.patch(URL, {"brand_color": "#ff6600", "default_show_prices": False, "default_enquiries_enabled": False,
                       "default_whatsapp_number": "+91 90000 11111"}, format="json")
    created = client.post("/api/v1/catalogues/", {"name": "Summer"}, format="json").json()
    assert created["theme_color"] == "#ff6600" and created["show_prices"] is False
    assert created["enquiries_enabled"] is False and created["whatsapp_number"] == "+91 90000 11111"
    explicit = client.post("/api/v1/catalogues/", {"name": "Winter", "show_prices": True}, format="json").json()
    assert explicit["show_prices"] is True


def test_public_catalogue_shows_business_logo_and_social_links(biz, make_catalogue):
    business, client = biz
    logo = image(business)
    client.patch(URL, {"logo_id": str(logo.id)}, format="json")
    client.patch(f"/api/v1/businesses/{business.id}/", {"social_links": {"instagram": "https://instagram.com/sharma"}}, format="json")
    catalogue = make_catalogue(business, status="published")
    data = APIClient().get(f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/").json()
    assert data["business"]["social_links"] == {"instagram": "https://instagram.com/sharma"}
    assert data["business"]["logo"]["id"] == str(logo.id)
    assert "enquiry_email_enabled" not in str(data) and "default_" not in str(data)
