from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import SupportTicket, TicketCategory, TicketMessage, TicketPriority, TicketStatus

STAFF_LABEL = "Support team"


class TicketMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = ["id", "kind", "author_name", "is_staff", "is_internal", "is_mine", "body", "created_at"]
        read_only_fields = fields

    def get_author_name(self, obj) -> str:
        # Businesses see "Support team", never individual staff names.
        if obj.is_staff and not self.context.get("platform"):
            return STAFF_LABEL
        return obj.author_name or "Deleted user"

    def get_is_mine(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and obj.author_id == request.user.pk)


class TicketSerializer(serializers.ModelSerializer):
    reference = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    message_count = serializers.IntegerField(read_only=True, default=0)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = SupportTicket
        fields = [
            "id", "reference", "subject", "category", "priority", "status", "created_by_name", "is_mine",
            "message_count", "created_at", "last_activity_at", "status_changed_at", "resolved_at", "closed_at",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj) -> str:
        return (obj.created_by.full_name or obj.created_by.email) if obj.created_by else "Deleted user"

    def get_is_mine(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and obj.created_by_id == request.user.pk)


class TicketDetailSerializer(TicketSerializer):
    messages = serializers.SerializerMethodField()

    class Meta(TicketSerializer.Meta):
        fields = [*TicketSerializer.Meta.fields, "messages"]
        read_only_fields = fields

    @extend_schema_field(TicketMessageSerializer(many=True))
    def get_messages(self, obj):
        messages = obj.messages.all()
        if not self.context.get("platform"):
            messages = [m for m in messages if not m.is_internal]
        return TicketMessageSerializer(messages, many=True, context=self.context).data


class StaffBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    email = serializers.EmailField()


class AdminTicketSerializer(TicketSerializer):
    business_id = serializers.UUIDField(read_only=True, allow_null=True)
    business_name = serializers.CharField(source="business.name", read_only=True, default="")
    business_slug = serializers.CharField(source="business.slug", read_only=True, default="")
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, default="")
    assigned_to = serializers.SerializerMethodField()

    class Meta(TicketSerializer.Meta):
        fields = [*TicketSerializer.Meta.fields, "business_id", "business_name", "business_slug", "created_by_email",
                  "assigned_to", "first_response_at"]
        read_only_fields = fields

    @extend_schema_field(StaffBriefSerializer(allow_null=True))
    def get_assigned_to(self, obj):
        user = obj.assigned_to
        return {"id": user.pk, "name": user.full_name or user.email, "email": user.email} if user else None


class AdminTicketDetailSerializer(AdminTicketSerializer):
    messages = serializers.SerializerMethodField()

    class Meta(AdminTicketSerializer.Meta):
        fields = [*AdminTicketSerializer.Meta.fields, "messages"]
        read_only_fields = fields

    @extend_schema_field(TicketMessageSerializer(many=True))
    def get_messages(self, obj):
        return TicketMessageSerializer(obj.messages.all(), many=True, context=self.context).data


# --- Inputs ---------------------------------------------------------------------------------------
class TicketCreateSerializer(serializers.Serializer):
    subject = serializers.CharField(min_length=5, max_length=150)
    category = serializers.ChoiceField(choices=TicketCategory.choices)
    priority = serializers.ChoiceField(choices=TicketPriority.choices, default=TicketPriority.MEDIUM)
    description = serializers.CharField(min_length=10, max_length=5000)
    client_key = serializers.UUIDField(required=False, allow_null=True)

    def validate_subject(self, value):
        return " ".join(value.split())


class ReplySerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=5000)

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError("Write a message.")
        return value.strip()


class StaffReplySerializer(ReplySerializer):
    internal = serializers.BooleanField(default=False)
    status = serializers.ChoiceField(choices=TicketStatus.choices, required=False)


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TicketStatus.choices)


class AdminTicketUpdateSerializer(serializers.Serializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(is_active=True), required=False, allow_null=True
    )
    priority = serializers.ChoiceField(choices=TicketPriority.choices, required=False)
    category = serializers.ChoiceField(choices=TicketCategory.choices, required=False)


class CountSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class TicketSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    statuses = CountSerializer(many=True)
    categories = CountSerializer(many=True)
    unassigned = serializers.IntegerField()
