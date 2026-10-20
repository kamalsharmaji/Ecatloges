from rest_framework import serializers

from .models import ActorType, AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.UUIDField(source="actor.id", read_only=True, allow_null=True, default=None)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id", "created_at", "actor_id", "actor_name", "actor_type", "action", "module",
            "target_type", "target_id", "target_label", "changes", "metadata",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj) -> str:
        # Businesses see that the platform acted, not which staff member did.
        if obj.actor_type == ActorType.PLATFORM_ADMIN and not self.context.get("platform"):
            return "myEcatalogues team"
        if obj.actor_type == ActorType.SYSTEM:
            return "System"
        return obj.actor_name


class PlatformAuditLogSerializer(AuditLogSerializer):
    business_id = serializers.UUIDField(read_only=True, allow_null=True)
    business_name = serializers.CharField(source="business.name", read_only=True, default="")

    class Meta(AuditLogSerializer.Meta):
        fields = [*AuditLogSerializer.Meta.fields, "scope", "business_id", "business_name", "request_id"]
        read_only_fields = fields


class ActorOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class ActivityFiltersSerializer(serializers.Serializer):
    modules = serializers.ListField(child=serializers.CharField())
    actions = serializers.ListField(child=serializers.CharField())
    actors = ActorOptionSerializer(many=True)
