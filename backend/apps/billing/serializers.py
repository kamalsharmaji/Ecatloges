from django.conf import settings
from rest_framework import serializers

from .models import LIMIT_FIELDS, Invoice, InvoiceLine, Payment, PaymentEvent, Plan, Subscription

PLAN_PUBLIC_FIELDS = [
    "id",
    "code",
    "name",
    "description",
    "price",
    "currency",
    "interval",
    "tier_rank",
    *LIMIT_FIELDS,
    "is_development_seed",
]


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = PLAN_PUBLIC_FIELDS
        read_only_fields = PLAN_PUBLIC_FIELDS


class AdminPlanSerializer(serializers.ModelSerializer):
    subscriber_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Plan
        fields = [
            *PLAN_PUBLIC_FIELDS,
            "is_active",
            "is_public",
            "sort_order",
            "subscriber_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "subscriber_count", "created_at", "updated_at"]

    def validate_currency(self, value):
        value = value.strip().upper()
        if value not in settings.BILLING_CURRENCIES:
            raise serializers.ValidationError(f"Supported currencies: {', '.join(settings.BILLING_CURRENCIES)}.")
        return value

    def validate(self, attrs):
        video = attrs.get("video_uploads_enabled", getattr(self.instance, "video_uploads_enabled", False))
        if not video and attrs.get("max_video_size_mb"):
            raise serializers.ValidationError({"max_video_size_mb": ["Enable video uploads to set a video size limit."]})
        return attrs


class PlanBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ["id", "code", "name", "price", "currency", "interval", "is_active"]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = PlanBriefSerializer(read_only=True)
    pending_plan = PlanBriefSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id",
            "status",
            "plan",
            "plan_code",
            "plan_name",
            "plan_price",
            "plan_currency",
            "plan_interval",
            "limits",
            "starts_at",
            "current_period_start",
            "current_period_end",
            "grace_until",
            "cancel_at_period_end",
            "cancelled_at",
            "pending_plan",
            "activated_at",
            "ended_at",
            "abandoned_reason",
            "created_at",
        ]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    """Customer-facing payment. Internal review notes and gateway payment ids are not exposed."""

    plan_name = serializers.CharField(source="subscription.plan_name", read_only=True)
    plan_id = serializers.UUIDField(source="subscription.plan_id", read_only=True)
    subscription_id = serializers.UUIDField(read_only=True)
    under_review = serializers.BooleanField(source="requires_attention", read_only=True)
    invoice_id = serializers.SerializerMethodField()
    checkout = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "kind",
            "status",
            "provider",
            "is_test",
            "provider_order_id",
            "subscription_id",
            "plan_id",
            "plan_name",
            "currency",
            "subtotal",
            "discount_amount",
            "tax_name",
            "tax_rate",
            "tax_inclusive",
            "tax_amount",
            "amount",
            "period_start",
            "period_end",
            "expires_at",
            "paid_at",
            "applied_at",
            "failure_code",
            "failure_message",
            "under_review",
            "invoice_id",
            "checkout",
            "created_at",
        ]
        read_only_fields = fields

    def get_invoice_id(self, obj) -> str | None:
        invoice = getattr(obj, "invoice", None)
        return str(invoice.id) if invoice else None

    def get_checkout(self, obj) -> dict | None:
        # Only an open checkout needs the gateway payload (public values only).
        return obj.checkout_payload if obj.status == Payment.Status.CREATED else None


class PaymentEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentEvent
        fields = ["id", "provider", "event_id", "event_type", "outcome", "detail", "summary", "received_at"]


class BillingBusinessSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()


class AdminPaymentSerializer(PaymentSerializer):
    business = BillingBusinessSerializer(read_only=True)
    events = PaymentEventSerializer(many=True, read_only=True)

    class Meta(PaymentSerializer.Meta):
        fields = [
            *PaymentSerializer.Meta.fields,
            "business",
            "provider_payment_id",
            "requires_attention",
            "attention_reason",
            "last_reconciled_at",
            "events",
        ]
        read_only_fields = fields


class AdminSubscriptionSerializer(SubscriptionSerializer):
    business = BillingBusinessSerializer(read_only=True)

    class Meta(SubscriptionSerializer.Meta):
        fields = [*SubscriptionSerializer.Meta.fields, "business"]
        read_only_fields = fields


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ["description", "plan_code", "quantity", "unit_price", "amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payment_id = serializers.UUIDField(read_only=True)
    subscription_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "status",
            "issued_at",
            "period_start",
            "period_end",
            "currency",
            "subtotal",
            "discount_amount",
            "tax_name",
            "tax_rate",
            "tax_inclusive",
            "tax_amount",
            "total",
            "is_test",
            "seller",
            "buyer",
            "lines",
            "payment_id",
            "subscription_id",
        ]
        read_only_fields = fields


class AdminInvoiceSerializer(InvoiceSerializer):
    business = BillingBusinessSerializer(read_only=True)

    class Meta(InvoiceSerializer.Meta):
        fields = [*InvoiceSerializer.Meta.fields, "business"]
        read_only_fields = fields


class PlanChoiceSerializer(serializers.Serializer):
    plan_id = serializers.UUIDField()


class QuoteSerializer(serializers.Serializer):
    plan = PlanSerializer()
    kind = serializers.CharField()
    currency = serializers.CharField()
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2)
    tax_name = serializers.CharField()
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    tax_inclusive = serializers.BooleanField()
    tax_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    period_start = serializers.DateTimeField()
    period_end = serializers.DateTimeField()
    can_checkout = serializers.SerializerMethodField()
    blockers = serializers.ListField(child=serializers.DictField())

    def get_can_checkout(self, obj) -> bool:
        return not obj.blockers


class UsageSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    used = serializers.IntegerField(allow_null=True)
    limit = serializers.IntegerField(allow_null=True)


class BillingOverviewSerializer(serializers.Serializer):
    subscription = SubscriptionSerializer(allow_null=True)
    scheduled = SubscriptionSerializer(allow_null=True)
    open_checkout = PaymentSerializer(allow_null=True)
    has_paid_access = serializers.BooleanField()
    usage = UsageSerializer(many=True)
    email_verified = serializers.BooleanField()
    payments_test_mode = serializers.BooleanField()


class SimulatePaymentSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["captured", "failed"])
    amount_minor = serializers.IntegerField(required=False, min_value=0)
    currency = serializers.CharField(required=False, max_length=3)


class AdminCancelSerializer(serializers.Serializer):
    immediately = serializers.BooleanField(default=False)
