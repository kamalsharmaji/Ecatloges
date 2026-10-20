from rest_framework import serializers

from apps.businesses.models import Business

from .models import Announcement, AnnouncementAudience, Notification, NotificationCategory


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True, default="")

    class Meta:
        model = Notification
        fields = [
            "id", "category", "event", "level", "title", "body", "link", "target_type", "target_id",
            "business_id", "business_name", "is_read", "read_at", "created_at",
        ]
        read_only_fields = fields


class CategoryCountSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=NotificationCategory.choices)
    label = serializers.CharField()
    total = serializers.IntegerField()
    unread = serializers.IntegerField()
    today = serializers.IntegerField()


class NotificationSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    unread = serializers.IntegerField()
    categories = CategoryCountSerializer(many=True)


class MarkAllReadSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=NotificationCategory.choices, required=False)


class MarkAllReadResponseSerializer(serializers.Serializer):
    updated = serializers.IntegerField()


# --- Preferences --------------------------------------------------------------------------------
class PreferenceSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    note = serializers.CharField()
    in_app = serializers.BooleanField(allow_null=True)
    email = serializers.BooleanField(allow_null=True)
    in_app_available = serializers.BooleanField()
    email_available = serializers.BooleanField()
    in_app_locked = serializers.BooleanField()
    email_locked = serializers.BooleanField()


class PreferenceChangeSerializer(serializers.Serializer):
    key = serializers.CharField()
    in_app = serializers.BooleanField(required=False)
    email = serializers.BooleanField(required=False)


class PreferenceUpdateSerializer(serializers.Serializer):
    preferences = PreferenceChangeSerializer(many=True, allow_empty=False)


# --- Announcements --------------------------------------------------------------------------------
class AnnouncementFeedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ["id", "title", "body", "level", "published_at", "ends_at"]
        read_only_fields = fields


class BusinessOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()


class AnnouncementSerializer(serializers.ModelSerializer):
    businesses = BusinessOptionSerializer(many=True, read_only=True)
    business_ids = serializers.PrimaryKeyRelatedField(
        source="businesses", many=True, required=False, write_only=True,
        queryset=Business.objects.filter(status=Business.Status.ACTIVE),
    )
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "body", "level", "audience", "businesses", "business_ids", "status", "send_email",
            "starts_at", "ends_at", "published_at", "delivered_at", "recipient_count", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "published_at", "delivered_at", "recipient_count", "created_at", "updated_at"]

    def validate_title(self, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Use at least 3 characters.")
        return value

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": ["End time must be after the start time."]})
        audience = attrs.get("audience", getattr(self.instance, "audience", None))
        if audience != AnnouncementAudience.SELECTED_BUSINESSES and attrs.get("businesses"):
            raise serializers.ValidationError({"business_ids": ["Businesses can only be chosen for the “selected businesses” audience."]})
        if self.instance is not None and self.instance.delivered_at and any(
            k in attrs for k in ("audience", "businesses", "send_email")
        ):
            raise serializers.ValidationError({"audience": ["This announcement was already delivered; its audience can't change."]})
        return attrs


class AudienceCountSerializer(serializers.Serializer):
    audience = serializers.ChoiceField(choices=AnnouncementAudience.choices)
    business_ids = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=500)


class AudienceCountResponseSerializer(serializers.Serializer):
    recipients = serializers.IntegerField()


# --- Email templates --------------------------------------------------------------------------------
class TemplateVariableSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField()
    required = serializers.BooleanField()
    sample = serializers.CharField()


class EmailTemplateSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    group = serializers.CharField()
    mandatory = serializers.BooleanField()
    variables = TemplateVariableSerializer(many=True)
    subject = serializers.CharField()
    body = serializers.CharField()
    default_subject = serializers.CharField()
    default_body = serializers.CharField()
    is_custom = serializers.BooleanField(help_text="A saved override exists")
    is_active = serializers.BooleanField(help_text="The saved override is in use (otherwise the default is sent)")
    updated_at = serializers.DateTimeField(allow_null=True)
    updated_by_name = serializers.CharField(allow_blank=True)


class EmailTemplateUpdateSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=200, trim_whitespace=False)
    body = serializers.CharField(max_length=10_000, trim_whitespace=False)
    is_active = serializers.BooleanField(default=True)


class EmailTemplateDraftSerializer(serializers.Serializer):
    subject = serializers.CharField(required=False, max_length=200, trim_whitespace=False)
    body = serializers.CharField(required=False, max_length=10_000, trim_whitespace=False)


class EmailPreviewSerializer(serializers.Serializer):
    subject = serializers.CharField()
    body = serializers.CharField()
    errors = serializers.DictField(child=serializers.ListField(child=serializers.CharField()))
