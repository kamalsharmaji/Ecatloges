from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.models import PlatformRole
from apps.businesses.models import Business
from apps.catalogues.models import Catalogue
from apps.media_library.serializers import MediaBriefSerializer


class AdminBusinessSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner_full_name", read_only=True, default="")
    owner_email = serializers.CharField(read_only=True, default="")
    member_count = serializers.IntegerField(read_only=True)
    catalogue_count = serializers.IntegerField(read_only=True)
    product_count = serializers.IntegerField(read_only=True)
    enquiry_count = serializers.IntegerField(read_only=True)
    storage_bytes = serializers.IntegerField(read_only=True)
    plan_name = serializers.CharField(read_only=True, default="")
    subscription_status = serializers.CharField(read_only=True, default="")
    subscription_ends_at = serializers.DateTimeField(read_only=True, default=None)

    class Meta:
        model = Business
        fields = [
            "id", "name", "slug", "category", "city", "state", "country", "phone", "email", "status",
            "owner_name", "owner_email", "member_count", "catalogue_count", "product_count", "enquiry_count",
            "storage_bytes", "plan_name", "subscription_status", "subscription_ends_at", "created_at",
        ]
        read_only_fields = fields


class MembershipBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user_id = serializers.UUIDField()
    name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.CharField()
    status = serializers.CharField()
    is_owner = serializers.BooleanField()


class SubscriptionBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    plan_name = serializers.CharField()
    status = serializers.CharField()
    current_period_start = serializers.DateTimeField(allow_null=True)
    current_period_end = serializers.DateTimeField(allow_null=True)
    cancel_at_period_end = serializers.BooleanField()
    created_at = serializers.DateTimeField()


class PaymentBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField()
    status = serializers.CharField()
    is_test = serializers.BooleanField()
    paid_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class CatalogueBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    public_url = serializers.CharField(allow_null=True)


class EventBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    action = serializers.CharField()
    actor_name = serializers.CharField()
    target_label = serializers.CharField()
    created_at = serializers.DateTimeField()


class AdminBusinessDetailSerializer(AdminBusinessSerializer):
    logo = MediaBriefSerializer(read_only=True, allow_null=True)
    # Sources are plain attributes set by the view (names chosen not to clash with reverse relations).
    members = MembershipBriefSerializer(source="detail_members", many=True, read_only=True)
    subscriptions = SubscriptionBriefSerializer(source="detail_subscriptions", many=True, read_only=True)
    payments = PaymentBriefSerializer(source="detail_payments", many=True, read_only=True)
    catalogues = CatalogueBriefSerializer(source="detail_catalogues", many=True, read_only=True)
    activity = EventBriefSerializer(source="detail_activity", many=True, read_only=True)

    class Meta(AdminBusinessSerializer.Meta):
        fields = [
            *AdminBusinessSerializer.Meta.fields, "address_line1", "address_line2", "postal_code", "website",
            "description", "logo", "members", "subscriptions", "payments", "catalogues", "activity",
        ]
        read_only_fields = fields


class StatusChangeSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, max_length=300)


class AdminUserSerializer(serializers.ModelSerializer):
    membership_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = get_user_model()
        # Deliberately no password hash, tokens or permissions internals.
        fields = [
            "id", "email", "full_name", "phone", "platform_role", "is_active", "is_email_verified",
            "date_joined", "last_login", "membership_count",
        ]
        read_only_fields = fields


class UserMembershipSerializer(serializers.Serializer):
    business_id = serializers.UUIDField()
    business_name = serializers.CharField()
    business_status = serializers.CharField()
    role = serializers.CharField()
    status = serializers.CharField()
    joined_at = serializers.DateTimeField()


class AdminUserDetailSerializer(AdminUserSerializer):
    memberships = UserMembershipSerializer(source="membership_list", many=True, read_only=True)
    platform_permissions = serializers.ListField(child=serializers.CharField(), read_only=True)
    activity = EventBriefSerializer(many=True, read_only=True)

    class Meta(AdminUserSerializer.Meta):
        fields = [*AdminUserSerializer.Meta.fields, "memberships", "platform_permissions", "activity"]
        read_only_fields = fields


class AdminUserUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=False)
    platform_role = serializers.ChoiceField(choices=PlatformRole.choices, required=False, allow_blank=True)


class AdminCatalogueSerializer(serializers.ModelSerializer):
    business_id = serializers.UUIDField(read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)
    business_status = serializers.CharField(source="business.status", read_only=True)
    cover = MediaBriefSerializer(read_only=True, allow_null=True)
    product_count = serializers.IntegerField(read_only=True)
    view_count = serializers.IntegerField(read_only=True)
    enquiry_count = serializers.IntegerField(read_only=True)
    public_url = serializers.SerializerMethodField()

    class Meta:
        model = Catalogue
        fields = [
            "id", "name", "slug", "status", "business_id", "business_name", "business_status", "cover",
            "product_count", "view_count", "enquiry_count", "public_url", "published_at", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_public_url(self, obj) -> str | None:
        # Drafts have no public link — and the admin UI doesn't pretend they do.
        return obj.public_url if obj.status == "published" else None


class CountSerializer(serializers.Serializer):
    key = serializers.CharField()
    count = serializers.IntegerField()
