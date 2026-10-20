import pytest
from rest_framework.test import APIClient

from apps.catalogues import qr

pytestmark = pytest.mark.django_db


@pytest.fixture
def published(make_business, make_catalogue):
    business = make_business()
    catalogue = make_catalogue(business, name="Furniture", status="published", theme_color="#1d4ed8")
    return business, catalogue


def test_qr_png_points_to_public_url(published, owner_client):
    business, catalogue = published
    response = owner_client(business).get(f"/api/v1/catalogues/{catalogue.id}/qr/")
    assert response.status_code == 200 and response["Content-Type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")
    expected = f"http://localhost:5173/c/{business.slug}/{catalogue.slug}?src=qr"
    assert response["X-QR-Target"] == expected == qr.qr_target(catalogue)
    # Proof of content: regenerating the code for the expected URL yields identical bytes.
    assert response.content == qr.render_png(expected)
    assert f'filename="{catalogue.slug}-qr.png"' in response["Content-Disposition"]


def test_qr_svg_brand_colour_and_untracked_link(published, owner_client):
    business, catalogue = published
    client = owner_client(business)
    svg = client.get(f"/api/v1/catalogues/{catalogue.id}/qr/", {"type": "svg", "color": "brand"})
    assert svg["Content-Type"] == "image/svg+xml" and b"<svg" in svg.content and b"#1d4ed8" in svg.content
    plain = client.get(f"/api/v1/catalogues/{catalogue.id}/qr/", {"type": "svg", "tracking": "false"})
    assert plain["X-QR-Target"] == catalogue.public_url
    assert plain.content == qr.render_svg(catalogue.public_url)


def test_light_brand_colours_fall_back_to_black():
    assert qr.readable_color("#fde68a") == "#000000"
    assert qr.readable_color("#1d4ed8") == "#1d4ed8"
    assert qr.readable_color("bad") == "#000000"


@pytest.mark.parametrize("status", ["draft", "archived"])
def test_no_qr_for_unpublished_catalogues(make_business, make_catalogue, owner_client, status):
    business = make_business()
    catalogue = make_catalogue(business, status=status)
    response = owner_client(business).get(f"/api/v1/catalogues/{catalogue.id}/qr/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "catalogue_not_published"
    assert APIClient().get(f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/qr.svg").status_code == 404


def test_qr_validation(published, owner_client):
    business, catalogue = published
    client = owner_client(business)
    assert client.get(f"/api/v1/catalogues/{catalogue.id}/qr/", {"type": "gif"}).status_code == 400
    assert client.get(f"/api/v1/catalogues/{catalogue.id}/qr/", {"size": "big"}).status_code == 400


def test_qr_permissions_and_isolation(published, add_member, client_for, make_business, owner_client):
    business, catalogue = published
    enquiry_mgr = client_for(add_member(business, "enquiry_manager").user, business)
    viewer = client_for(add_member(business, "viewer").user, business)
    assert enquiry_mgr.get(f"/api/v1/catalogues/{catalogue.id}/qr/").status_code == 403  # no qrcode.view
    assert viewer.get(f"/api/v1/catalogues/{catalogue.id}/qr/").status_code == 200
    assert owner_client(make_business()).get(f"/api/v1/catalogues/{catalogue.id}/qr/").status_code == 404
    assert APIClient().get(f"/api/v1/catalogues/{catalogue.id}/qr/").status_code == 401


def test_public_share_qr(published):
    business, catalogue = published
    response = APIClient().get(f"/api/v1/public/catalogues/{business.slug}/{catalogue.slug}/qr.svg")
    assert response.status_code == 200 and response["Content-Type"] == "image/svg+xml"
    assert response.content == qr.render_svg(qr.qr_target(catalogue), color="#1d4ed8")
