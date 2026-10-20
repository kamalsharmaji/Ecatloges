from django.db.models import Q
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.media_library.serializers import MediaBriefSerializer
from apps.rbac.models import Role
from apps.rbac.serializers import RoleSummarySerializer

from .models import Business, BusinessMembership, StaffInvitation

BUSINESS_PROFILE_FIELDS = [
    "name",
    "owner_name",
    "phone",
    "email",
    "category",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
    "country",
    "website",
    "description",
    "social_links",
]

SOCIAL_NETWORKS = {
    "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",),
    "youtube": ("youtube.com", "youtu.be"),
    "linkedin": ("linkedin.com",),
    "x": ("x.com", "twitter.com"),
}


class BusinessSerializer(serializers.ModelSerializer):
    class Meta:
        model = Business
        fields = ["id", "slug", *BUSINESS_PROFILE_FIELDS, "status", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "status", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Business name must be at least 2 characters.")
        return value

    def validate_country(self, value):
        value = value.strip().upper()
        if len(value) != 2 or not value.isalpha():
            raise serializers.ValidationError("Use a 2-letter ISO country code, e.g. IN.")
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate_social_links(self, value):
        """Only known networks, https links on that network's own domain (no javascript:, no lookalikes)."""
        from urllib.parse import urlparse

        if not isinstance(value, dict):
            raise serializers.ValidationError("Send an object such as {\"instagram\": \"https://instagram.com/…\"}.")
        cleaned = {}
        for network, url in value.items():
            if network not in SOCIAL_NETWORKS:
                raise serializers.ValidationError(f"Unsupported network: {network}.")
            url = (url or "").strip()
            if not url:
                continue
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
            if parsed.scheme != "https" or not any(host == d or host.endswith(f".{d}") for d in SOCIAL_NETWORKS[network]):
                raise serializers.ValidationError(f"Enter an https:// link on {SOCIAL_NETWORKS[network][0]} for {network}.")
            if len(url) > 300:
                raise serializers.ValidationError(f"The {network} link is too long.")
            cleaned[network] = url
        return cleaned


class BusinessSettingsSerializer(serializers.ModelSerializer):
    """Branding and catalogue defaults (Settings). Requires `settings.update` to change."""

    logo = serializers.SerializerMethodField()
    logo_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)
    brand_color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False,
                                         error_messages={"invalid": "Use a hex colour like #1d4ed8."})

    class Meta:
        model = Business
        fields = [
            "logo", "logo_id", "brand_color", "default_show_prices", "default_enquiries_enabled",
            "default_whatsapp_number", "enquiry_email_enabled",
        ]

    @extend_schema_field(MediaBriefSerializer(allow_null=True))
    def get_logo(self, obj):
        return MediaBriefSerializer(obj.logo).data if obj.logo_id else None

    def validate_logo_id(self, value):
        from apps.media_library.models import MediaAsset

        if value is None:
            return None
        asset = MediaAsset.objects.filter(pk=value, business=self.instance, kind="image").first()
        if asset is None:  # foreign or missing ids look the same
            raise serializers.ValidationError("Select an image from your media library.")
        return asset

    def update(self, instance, validated_data):
        if "logo_id" in validated_data:
            instance.logo = validated_data.pop("logo_id")
        if "brand_color" in validated_data:
            validated_data["brand_color"] = validated_data["brand_color"].lower()
        return super().update(instance, validated_data)


class BusinessBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Business
        fields = ["id", "name", "slug", "category", "city", "status"]


class MyBusinessSerializer(serializers.ModelSerializer):
    """A business as seen from the caller's membership (used by the business picker)."""

    membership_id = serializers.UUIDField(source="id")
    membership_status = serializers.CharField(source="status")
    role = RoleSummarySerializer()
    business = BusinessBriefSerializer()

    class Meta:
        model = BusinessMembership
        fields = ["membership_id", "membership_status", "role", "business"]


class MemberUserSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    phone = serializers.CharField()


class MembershipSerializer(serializers.ModelSerializer):
    user = MemberUserSerializer(read_only=True)
    role = RoleSummarySerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(source="role", queryset=Role.objects.none(), write_only=True, required=False)
    is_owner = serializers.BooleanField(read_only=True)

    class Meta:
        model = BusinessMembership
        fields = ["id", "user", "role", "role_id", "status", "is_owner", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_fields(self):
        fields = super().get_fields()
        business = self.context.get("business")
        if business is not None:
            # Only system roles and this business's own custom roles are selectable.
            fields["role_id"].queryset = Role.objects.filter(Q(business__isnull=True) | Q(business=business))
        return fields


class InvitationSerializer(serializers.ModelSerializer):
    role = RoleSummarySerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(source="role", queryset=Role.objects.none(), write_only=True)
    invited_by = serializers.CharField(source="invited_by.full_name", read_only=True, default=None)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = StaffInvitation
        fields = ["id", "email", "role", "role_id", "status", "invited_by", "expires_at", "is_expired", "created_at"]
        read_only_fields = ["id", "status", "expires_at", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        business = self.context.get("business")
        if business is not None:
            fields["role_id"].queryset = Role.objects.filter(Q(business__isnull=True) | Q(business=business))
        return fields


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class TransferOwnershipSerializer(serializers.Serializer):
    membership_id = serializers.UUIDField()


class BusinessContextSerializer(serializers.Serializer):
    business = BusinessSerializer()
    membership_id = serializers.UUIDField(source="membership.id")
    role = RoleSummarySerializer(source="membership.role")
    is_owner = serializers.BooleanField()
    permissions = serializers.SerializerMethodField()

    def get_permissions(self, obj) -> list[str]:
        return sorted(obj.permissions)
