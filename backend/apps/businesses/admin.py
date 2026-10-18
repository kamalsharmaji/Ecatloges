from django.contrib import admin

from .models import Business, BusinessMembership, StaffInvitation


class MembershipInline(admin.TabularInline):
    model = BusinessMembership
    fk_name = "business"
    extra = 0
    autocomplete_fields = ("user",)
    fields = ("user", "role", "status", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "category", "city", "status", "created_at")
    list_filter = ("status", "category", "country")
    search_fields = ("name", "slug", "email", "owner_name")
    readonly_fields = ("id", "slug", "created_by", "created_at", "updated_at")
    inlines = [MembershipInline]


@admin.register(StaffInvitation)
class StaffInvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "business", "role", "status", "expires_at", "created_at")
    list_filter = ("status",)
    search_fields = ("email", "business__name")
    exclude = ("token_hash",)
    readonly_fields = ("accepted_by", "accepted_at")
