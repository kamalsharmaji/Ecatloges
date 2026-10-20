from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only: the trail is append-only."""

    list_display = ("created_at", "scope", "action", "target_label", "actor_name", "business")
    list_filter = ("scope", "module", "actor_type")
    search_fields = ("action", "target_label", "actor_name", "request_id")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
