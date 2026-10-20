import hashlib
from io import BytesIO
from pathlib import Path
from unittest import mock

import pytest
from django.conf import settings
from django.core.files.storage import default_storage
from django.test import override_settings
from PIL import Image

from apps.media_library.models import MediaAsset
from apps.products.models import ProductMedia
from conftest import activate_subscription, image_bytes, mp4_bytes, upload

pytestmark = pytest.mark.django_db
URL = "/api/v1/media/"


def stored_files() -> set[str]:
    root = Path(settings.MEDIA_ROOT)
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}


def post_file(client, name, content, **extra):
    return client.post(URL, {"file": upload(name, content), **extra}, format="multipart")


@pytest.fixture
def video_business(make_business, make_plan):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(video_uploads_enabled=True, max_video_size_mb=5, max_image_size_mb=2))
    return business


# --- Valid uploads -------------------------------------------------------------------------------
def test_image_upload_preserves_original_and_creates_renditions(make_business, owner_client):
    business = make_business()
    original = image_bytes("JPEG", size=(2400, 1200))
    response = post_file(owner_client(business), "My Sofa (1).JPG", original, folder="product_images", title="Sofa")
    assert response.status_code == 201, response.content
    body = response.json()
    asset = MediaAsset.objects.get(pk=body["id"])
    assert body["kind"] == "image" and body["extension"] == "jpg" and body["width"] == 2400
    assert body["original_filename"] == "My Sofa (1).JPG" and body["folder"] == "product_images"
    # Original is byte-for-byte identical; derived files are separate WebP renditions.
    with default_storage.open(asset.original.name, "rb") as fh:
        assert fh.read() == original
    assert asset.sha256 == hashlib.sha256(original).hexdigest()
    with default_storage.open(asset.thumbnail.name, "rb") as fh:
        thumb = Image.open(fh)
        assert thumb.format == "WEBP" and max(thumb.size) == settings.MEDIA_THUMBNAIL_SIZE
    with default_storage.open(asset.preview.name, "rb") as fh:
        assert max(Image.open(fh).size) == settings.MEDIA_PREVIEW_SIZE
    # Storage paths are random per asset; the client's filename is never used as a path.
    assert str(business.pk) in asset.original.name and "Sofa" not in asset.original.name
    assert body["thumbnail_url"].endswith("thumbnail.webp") and "MEDIA_ROOT" not in str(body)


def test_video_upload_detects_duration(video_business, owner_client):
    response = post_file(owner_client(video_business), "clip.mp4", mp4_bytes(duration_seconds=28))
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["kind"] == "video" and body["duration_seconds"] == 28.0 and body["mime_type"] == "video/mp4"
    assert body["thumbnail_url"] is None and body["preview_url"].endswith("original.mp4")


# --- Invalid uploads --------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("name", "content", "code"),
    [
        ("script.exe", b"MZ\x90\x00", "unsupported_type"),
        ("notes.txt", b"hello", "unsupported_type"),
        ("fake.png", b"this is not an image", "invalid_file"),
        ("photo.png", image_bytes("JPEG"), "type_mismatch"),
        ("movie.mp4", b"\x00" * 64, "invalid_file"),
        ("empty.png", b"", "invalid_file"),
        ("../../etc/passwd.png", b"nope", "invalid_file"),
    ],
)
def test_invalid_files_are_rejected_and_nothing_is_stored(make_business, owner_client, name, content, code):
    business = make_business()
    before = stored_files()
    response = post_file(owner_client(business), name, content)
    assert response.status_code == 400, response.content
    assert response.json()["error"]["code"] == "validation_error"
    assert not MediaAsset.objects.exists() and stored_files() == before


@override_settings(MEDIA_MAX_UPLOAD_MB=1)
def test_absolute_size_cap(make_business, owner_client):
    response = post_file(owner_client(make_business()), "big.mp4", mp4_bytes(pad=1024 * 1024 + 10))
    assert response.status_code == 400 and "file" in response.json()["error"]["details"]


# --- Plan limits -----------------------------------------------------------------------------
def test_video_not_in_plan(make_business, owner_client):
    business = make_business()  # default test plan has video uploads disabled
    response = post_file(owner_client(business), "clip.mp4", mp4_bytes())
    assert response.status_code == 402 and response.json()["error"]["code"] == "feature_not_in_plan"


def test_plan_file_size_limits(video_business, owner_client):
    client = owner_client(video_business)
    big_video = post_file(client, "big.mp4", mp4_bytes(pad=6 * 1024 * 1024))
    assert big_video.status_code == 402
    # Random noise doesn't compress, so this PNG is genuinely over the plan's 2 MB image limit.
    noisy = Image.effect_noise((1800, 1800), 100).convert("RGB")
    buf = BytesIO()
    noisy.save(buf, "PNG")
    assert len(buf.getvalue()) > 2 * 1024 * 1024
    response = post_file(client, "noise.png", buf.getvalue())
    assert response.status_code == 402 and "2 MB" in response.json()["error"]["message"]
    assert post_file(client, "small.png", image_bytes()).status_code == 201


def test_storage_limit_counts_existing_files(make_business, make_plan, owner_client):
    business = make_business(subscribed=False)
    activate_subscription(business, make_plan(storage_limit_mb=1))
    MediaAsset.objects.create(
        business=business, kind="image", original="x/existing.png", original_filename="e.png", extension="png",
        mime_type="image/png", size_bytes=1024 * 1024 - 100, sha256="0" * 64,
    )
    before = stored_files()
    response = post_file(owner_client(business), "one-more.png", image_bytes())
    assert response.status_code == 402 and response.json()["error"]["code"] == "plan_limit_exceeded"
    assert MediaAsset.objects.count() == 1 and stored_files() == before  # no orphaned file


def test_failed_database_write_cleans_up_files(make_business, owner_client):
    business = make_business()
    before = stored_files()
    with mock.patch("apps.media_library.services.MediaAsset.objects.create", side_effect=RuntimeError("db down")):
        response = post_file(owner_client(business), "ok.png", image_bytes())
    assert response.status_code == 500 and response.json()["error"]["code"] == "server_error"
    assert stored_files() == before  # original + renditions were removed again


def test_uploads_require_subscription(make_business, owner_client):
    response = post_file(owner_client(make_business(subscribed=False)), "ok.png", image_bytes())
    assert response.status_code == 402 and response.json()["error"]["code"] == "subscription_required"


# --- Library management -----------------------------------------------------------------------
def test_list_filter_update_usage_and_delete(make_business, owner_client, django_capture_on_commit_callbacks):
    business = make_business()
    client = owner_client(business)
    a = post_file(client, "a.png", image_bytes(), folder="banners").json()
    post_file(client, "b.png", image_bytes())
    assert client.get(URL, {"folder": "banners"}).json()["count"] == 1
    assert client.get(URL, {"search": "b.png"}).json()["count"] == 1
    assert client.patch(f"{URL}{a['id']}/", {"folder": "catalogues", "title": "Hero"}, format="json").json()["folder"] == "catalogues"
    usage = client.get(f"{URL}usage/").json()
    assert usage["total"] == 2 and usage["images"] == 2 and usage["used_bytes"] > 0
    assert {f["key"]: f["count"] for f in usage["folders"]}["catalogues"] == 1
    asset = MediaAsset.objects.get(pk=a["id"])
    files = asset.file_names()
    assert all(default_storage.exists(f) for f in files)
    with django_capture_on_commit_callbacks(execute=True):
        assert client.delete(f"{URL}{a['id']}/").status_code == 204
    assert not any(default_storage.exists(f) for f in files)  # removed only after the delete committed


def test_media_in_use_cannot_be_deleted(make_business, owner_client, make_product):
    business = make_business()
    client = owner_client(business)
    asset_id = post_file(client, "a.png", image_bytes()).json()["id"]
    ProductMedia.objects.create(product=make_product(business), asset_id=asset_id)
    response = client.delete(f"{URL}{asset_id}/")
    assert response.status_code == 409 and response.json()["error"]["code"] == "media_in_use"
    bulk = client.post(f"{URL}bulk/", {"ids": [asset_id], "action": "delete"}, format="json").json()
    assert bulk == {"deleted": 0, "skipped_in_use": [asset_id]}


def test_bulk_move(make_business, owner_client):
    business = make_business()
    client = owner_client(business)
    ids = [post_file(client, f"{i}.png", image_bytes()).json()["id"] for i in range(2)]
    assert client.post(f"{URL}bulk/", {"ids": ids, "action": "move", "folder": "banners"}, format="json").json() == {"updated": 2}


def test_media_tenant_isolation_and_rbac(make_business, owner_client, add_member, client_for):
    a, b = make_business(), make_business()
    b_id = post_file(owner_client(b), "b.png", image_bytes()).json()["id"]
    client = owner_client(a)
    assert client.get(f"{URL}{b_id}/").status_code == 404
    assert client.patch(f"{URL}{b_id}/", {"title": "x"}, format="json").status_code == 404
    assert client.delete(f"{URL}{b_id}/").status_code == 404
    assert client.post(f"{URL}bulk/", {"ids": [b_id], "action": "delete"}, format="json").status_code == 404
    assert client.get(URL).json()["count"] == 0
    assert MediaAsset.objects.filter(pk=b_id).exists()
    viewer = client_for(add_member(a, "viewer").user, a)
    assert viewer.get(URL).status_code == 200
    assert post_file(viewer, "v.png", image_bytes()).status_code == 403
