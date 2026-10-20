import logging
import math
import uuid
from io import BytesIO

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, Q, Sum
from PIL import Image, ImageOps

from apps.audit_logs import services as audit
from apps.billing import entitlements
from apps.core.exceptions import BusinessRuleViolation, PlanLimitExceeded

from .inspection import UploadInfo, inspect_upload
from .models import MediaAsset, MediaFolder, MediaKind
from .signals import delete_files

logger = logging.getLogger("apps.media_library")
MB = 1024 * 1024


# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
def storage_used_bytes(business) -> int:
    totals = MediaAsset.objects.filter(business=business).aggregate(
        o=Sum("size_bytes"), t=Sum("thumbnail_bytes"), p=Sum("preview_bytes")
    )
    return sum(v or 0 for v in totals.values())


def storage_used_mb(business) -> int:
    """Usage counter for the `storage_limit_mb` plan limit (rounded up)."""
    return math.ceil(storage_used_bytes(business) / MB)


def usage_summary(business) -> dict:
    subscription = entitlements.current_subscription(business)
    counts = MediaAsset.objects.filter(business=business).aggregate(
        total=Count("id"),
        images=Count("id", filter=Q(kind=MediaKind.IMAGE)),
        videos=Count("id", filter=Q(kind=MediaKind.VIDEO)),
    )
    folders = dict(
        MediaAsset.objects.filter(business=business).values_list("folder").annotate(n=Count("id")).values_list("folder", "n")
    )
    limits = subscription.limits if subscription else {}
    return {
        **counts,
        "used_bytes": storage_used_bytes(business),
        "limit_mb": limits.get("storage_limit_mb"),
        "max_image_size_mb": limits.get("max_image_size_mb"),
        "video_uploads_enabled": bool(limits.get("video_uploads_enabled")),
        "max_video_size_mb": limits.get("max_video_size_mb"),
        "max_upload_mb": settings.MEDIA_MAX_UPLOAD_MB,
        "folders": [{"key": f.value, "label": f.label, "count": folders.get(f.value, 0)} for f in MediaFolder],
    }


# ---------------------------------------------------------------------------
# Plan checks
# ---------------------------------------------------------------------------
def _limit(message: str, code: str = "plan_limit_exceeded") -> PlanLimitExceeded:
    return PlanLimitExceeded(message, code=code)


def assert_upload_allowed(business, info: UploadInfo) -> None:
    """Checks the plan snapshot: subscription, per-file size, video permission, total storage."""
    limits = entitlements.require_paid_access(business).limits
    size_mb = info.size_bytes / MB
    if info.kind == MediaKind.IMAGE:
        cap = limits.get("max_image_size_mb")
        if cap is not None and size_mb > cap:
            raise _limit(f"Your plan allows images up to {cap} MB.")
    else:
        if not limits.get("video_uploads_enabled"):
            raise _limit("Video uploads are not included in your plan. Upgrade to upload videos.", "feature_not_in_plan")
        cap = limits.get("max_video_size_mb")
        if cap is not None and size_mb > cap:
            raise _limit(f"Your plan allows videos up to {cap} MB.")
    storage_cap = limits.get("storage_limit_mb")
    if storage_cap is not None and storage_used_bytes(business) + info.size_bytes > storage_cap * MB:
        raise _limit(f"This upload would exceed your plan's {storage_cap} MB of storage. Free up space or upgrade.")


# ---------------------------------------------------------------------------
# Renditions
# ---------------------------------------------------------------------------
def _rendition(source, max_side: int) -> bytes:
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        out = BytesIO()
        img.save(out, "WEBP", quality=82, method=4)
        return out.getvalue()


# ---------------------------------------------------------------------------
# Upload / delete
# ---------------------------------------------------------------------------
def upload_media(ctx, *, user, upload, folder: str = MediaFolder.OTHERS, title: str = "") -> MediaAsset:
    info = inspect_upload(upload)
    # Fail fast before touching storage (re-checked under lock below).
    assert_upload_allowed(ctx.business, info)

    asset_id = uuid.uuid4()
    base = f"businesses/{ctx.business.pk}/media/{asset_id}"
    saved: list[str] = []
    try:
        # The original is streamed to storage exactly as uploaded — never re-encoded.
        original_name = default_storage.save(f"{base}/original.{info.extension}", upload)
        saved.append(original_name)
        thumb_name = preview_name = ""
        thumb_bytes = preview_bytes = 0
        if info.kind == MediaKind.IMAGE:
            try:
                with default_storage.open(original_name, "rb") as fh:
                    thumb = _rendition(fh, settings.MEDIA_THUMBNAIL_SIZE)
                with default_storage.open(original_name, "rb") as fh:
                    preview = _rendition(fh, settings.MEDIA_PREVIEW_SIZE)
                thumb_name = default_storage.save(f"{base}/thumbnail.webp", ContentFile(thumb))
                saved.append(thumb_name)
                preview_name = default_storage.save(f"{base}/preview.webp", ContentFile(preview))
                saved.append(preview_name)
                thumb_bytes, preview_bytes = len(thumb), len(preview)
            except (OSError, ValueError):
                # The original is still valid; clients fall back to it. Logged for follow-up.
                logger.exception("Image rendition failed", extra={"asset_id": str(asset_id)})

        with transaction.atomic():
            entitlements.lock_business(ctx.business)
            assert_upload_allowed(ctx.business, info)  # authoritative check, serialised per business
            asset = MediaAsset.objects.create(
                id=asset_id,
                business=ctx.business,
                kind=info.kind,
                folder=folder,
                original=original_name,
                original_filename=info.display_name,
                extension=info.extension,
                mime_type=info.mime_type,
                size_bytes=info.size_bytes,
                sha256=info.sha256,
                width=info.width,
                height=info.height,
                duration_seconds=info.duration_seconds,
                thumbnail=thumb_name,
                thumbnail_bytes=thumb_bytes,
                preview=preview_name,
                preview_bytes=preview_bytes,
                title=title[:150],
                uploaded_by=user,
            )
            audit.record_ctx(ctx, "media.uploaded", target=asset, target_label=asset.title or asset.original_filename,
                             metadata={"kind": asset.kind, "folder": folder, "bytes": asset.size_bytes})
    except BaseException:
        # Never leave orphaned files behind when validation, limits or the database fail.
        delete_files(saved)
        raise
    logger.info("Media uploaded", extra={"asset_id": str(asset.id), "kind": asset.kind, "bytes": asset.size_bytes})
    return asset


def references(asset: MediaAsset) -> dict[str, int]:
    from apps.catalogues.models import Catalogue
    from apps.products.models import Category, ProductMedia

    return {
        "products": ProductMedia.objects.filter(asset=asset).count(),
        "catalogues": Catalogue.objects.filter(Q(cover=asset) | Q(logo=asset)).count(),
        "categories": Category.objects.filter(image=asset).count(),
    }


@transaction.atomic
def delete_media(asset: MediaAsset, *, ctx=None) -> None:
    used = {k: v for k, v in references(asset).items() if v}
    if used:
        where = ", ".join(f"{count} {kind}" for kind, count in used.items())
        raise BusinessRuleViolation(f"This file is used by {where}. Remove it there first.", code="media_in_use")
    if ctx is not None:
        audit.record_ctx(ctx, "media.deleted", target=asset, target_label=asset.title or asset.original_filename)
    asset.delete()  # files are removed after commit (signals.py)
