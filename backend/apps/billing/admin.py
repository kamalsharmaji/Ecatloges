"""Django admin: read-mostly views for support staff. Billing records are never edited here."""
from django.contrib import admin

from .models import Invoice, InvoiceLine, Payment, PaymentEvent, Plan, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "price", "currency", "interval", "tier_rank", "is_active", "is_public", "is_development_seed")
    list_filter = ("interval", "is_active", "is_public", "is_development_seed")
    search_fields = ("name", "code")


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Subscription)
class SubscriptionAdmin(ReadOnlyAdmin):
    list_display = ("business", "plan_name", "status", "current_period_end", "cancel_at_period_end", "created_at")
    list_filter = ("status", "plan_interval")
    search_fields = ("business__name", "plan_code")


class PaymentEventInline(admin.TabularInline):
    model = PaymentEvent
    extra = 0
    can_delete = False
    fields = ("event_type", "outcome", "detail", "received_at")
    readonly_fields = fields


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdmin):
    list_display = ("provider_order_id", "business", "kind", "status", "amount", "currency", "is_test", "requires_attention")
    list_filter = ("status", "kind", "provider", "is_test", "requires_attention")
    search_fields = ("provider_order_id", "provider_payment_id", "business__name")
    exclude = ("checkout_payload",)
    inlines = [PaymentEventInline]


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    can_delete = False
    readonly_fields = ("description", "plan_code", "quantity", "unit_price", "amount")


@admin.register(Invoice)
class InvoiceAdmin(ReadOnlyAdmin):
    list_display = ("number", "business", "total", "currency", "status", "is_test", "issued_at")
    list_filter = ("status", "is_test")
    search_fields = ("number", "business__name")
    inlines = [InvoiceLineInline]
