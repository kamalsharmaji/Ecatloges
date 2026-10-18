from django.db.models import Q
from rest_framework import serializers

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
]


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
