from django.contrib import admin

from .models import SupportTicket, TicketMessage


class TicketMessageInline(admin.TabularInline):
    model = TicketMessage
    extra = 0
    fields = ("created_at", "author_name", "kind", "is_staff", "is_internal", "body")
    readonly_fields = fields
    can_delete = False


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("number", "subject", "business", "status", "priority", "assigned_to", "last_activity_at")
    list_filter = ("status", "priority", "category")
    search_fields = ("subject", "business__name", "created_by__email")
    raw_id_fields = ("business", "created_by", "assigned_to")
    inlines = [TicketMessageInline]
