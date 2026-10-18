from rest_framework import serializers

from .models import Permission, Role


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["code", "name", "module", "assignable"]


class RoleSerializer(serializers.ModelSerializer):
    # Written as a list of codes; rendered from the role's permission rows in to_representation.
    permissions = serializers.ListField(child=serializers.CharField(max_length=64), allow_empty=True, write_only=True)
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Role
        fields = ["id", "key", "name", "description", "is_system", "permissions", "member_count", "created_at"]
        read_only_fields = ["id", "key", "is_system", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["permissions"] = sorted(instance.permission_codes())
        return data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value


class RoleSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "key", "name", "is_system"]
