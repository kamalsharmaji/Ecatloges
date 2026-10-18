from django.contrib import admin

from .models import Permission, Role


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "module", "assignable")
    list_filter = ("module", "assignable")
    search_fields = ("code", "name")

    def has_add_permission(self, request):
        return False  # Managed by rbac.registry


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "business", "is_system", "created_at")
    list_filter = ("is_system",)
    search_fields = ("name", "key", "business__name")
    filter_horizontal = ()
    readonly_fields = ("is_system", "key")
