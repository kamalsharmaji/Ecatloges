"""
Uploaded media.

The original upload is stored byte-for-byte and never modified. Thumbnails and previews are
separate derived files. All files of an asset live under an unguessable per-asset UUID path:
    businesses/<business-id>/media/<asset-id>/original.<ext> | thumbnail.webp | preview.webp
"""
from django.conf import settings
from django.db import models

from apps.core.models import UUIDModel


class MediaKind(models.TextChoices):
    IMAGE = "image", "Image"
    VIDEO = "video", "Video"


class MediaFolder(models.TextChoices):
    # Fixed system folders (as in the Media Library design). Custom folders are a later addition.
    PRODUCT_IMAGES = "product_images", "Product images"
    PRODUCT_VIDEOS = "product_videos", "Product videos"
    CATALOGUES = "catalogues", "Catalogues"
    CATEGORY_ICONS = "category_icons", "Category images"
    BANNERS = "banners", "Banners"
    OTHERS = "others", "Others"


class MediaAsset(UUIDModel):
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="media_assets")
    kind = models.CharField(max_length=10, choices=MediaKind.choices)
    folder = models.CharField(max_length=30, choices=MediaFolder.choices, default=MediaFolder.OTHERS)

    original = models.FileField(max_length=255)
    original_filename = models.CharField(max_length=255, help_text="Sanitised display name of the uploaded file.")
    extension = models.CharField(max_length=10)
    mime_type = models.CharField(max_length=60)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)

    thumbnail = models.FileField(max_length=255, blank=True)
    thumbnail_bytes = models.PositiveBigIntegerField(default=0)
    preview = models.FileField(max_length=255, blank=True)
    preview_bytes = models.PositiveBigIntegerField(default=0)

    title = models.CharField(max_length=150, blank=True)
    alt_text = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["business", "folder"], name="media_biz_folder"),
            models.Index(fields=["business", "kind"], name="media_biz_kind"),
        ]

    def __str__(self):
        return self.original_filename

    @property
    def total_bytes(self) -> int:
        return self.size_bytes + self.thumbnail_bytes + self.preview_bytes

    def file_names(self) -> list[str]:
        return [f.name for f in (self.original, self.thumbnail, self.preview) if f and f.name]
