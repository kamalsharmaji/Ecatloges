from django.core.files.storage import default_storage
from rest_framework import serializers

from .models import MediaAsset, MediaFolder


def file_url(field) -> str | None:
    return default_storage.url(field.name) if field and field.name else None


class MediaBriefSerializer(serializers.ModelSerializer):
    """Compact representation used inside products, catalogues and categories."""

    thumbnail_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = ["id", "kind", "thumbnail_url", "preview_url", "width", "height", "duration_seconds", "title", "alt_text"]

    def get_thumbnail_url(self, obj) -> str | None:
        # Grids use the small derived image; fall back to the original only if no rendition exists.
        return file_url(obj.thumbnail) or (file_url(obj.original) if obj.kind == "image" else None)

    def get_preview_url(self, obj) -> str | None:
        return file_url(obj.preview) or file_url(obj.original)


class MediaAssetSerializer(MediaBriefSerializer):
    """Full asset for the business's own media library (includes the original's URL)."""

    original_url = serializers.SerializerMethodField()
    usage_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = MediaAsset
        fields = [
            "id",
            "kind",
            "folder",
            "original_filename",
            "extension",
            "mime_type",
            "size_bytes",
            "width",
            "height",
            "duration_seconds",
            "title",
            "alt_text",
            "thumbnail_url",
            "preview_url",
            "original_url",
            "usage_count",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f not in ("folder", "title", "alt_text")]

    def get_original_url(self, obj) -> str | None:
        return file_url(obj.original)


class MediaUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    folder = serializers.ChoiceField(choices=MediaFolder.choices, default=MediaFolder.OTHERS)
    title = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")


class MediaBulkSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)
    action = serializers.ChoiceField(choices=["move", "delete"])
    folder = serializers.ChoiceField(choices=MediaFolder.choices, required=False)


class FolderCountSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class MediaUsageSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    images = serializers.IntegerField()
    videos = serializers.IntegerField()
    used_bytes = serializers.IntegerField()
    limit_mb = serializers.IntegerField(allow_null=True)
    max_image_size_mb = serializers.IntegerField(allow_null=True)
    video_uploads_enabled = serializers.BooleanField()
    max_video_size_mb = serializers.IntegerField(allow_null=True)
    max_upload_mb = serializers.IntegerField()
    folders = FolderCountSerializer(many=True)
