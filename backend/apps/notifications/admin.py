from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "recipient", "business", "category", "title", "read_at")
    list_filter = ("category", "level")
    search_fields = ("title", "recipient__email")
    raw_id_fields = ("recipient", "business")
