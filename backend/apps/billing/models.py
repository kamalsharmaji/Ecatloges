"""
Billing data model.

Historical safety: a Subscription copies the plan's price and limits at purchase time
(`plan_*` snapshot fields + `limits`), and every Payment/Invoice stores its own amounts.
Editing or deactivating a Plan therefore never changes what an existing customer bought or
what an issued invoice says.
"""
from datetime import timedelta

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from apps.core.models import UUIDModel


class BillingInterval(models.TextChoices):
    MONTH = "month", "Monthly"
    YEAR = "year", "Yearly"


INTERVAL_DAYS = {BillingInterval.MONTH: 30, BillingInterval.YEAR: 365}


def add_interval(start, interval: str):
    """Billing periods are fixed-length (30 / 365 days) to keep proration-free maths predictable."""
    return start + timedelta(days=INTERVAL_DAYS[interval])


# Keys copied into Subscription.limits. None means "unlimited"; booleans are feature flags.
LIMIT_FIELDS = (
    "max_catalogues",
    "max_products",
    "max_staff",
    "storage_limit_mb",
    "max_image_size_mb",
    "video_uploads_enabled",
    "max_video_size_mb",
    "custom_branding",
    "analytics_enabled",
    "csv_import_enabled",
)


class Plan(UUIDModel):
    code = models.SlugField(max_length=60, unique=True, help_text="Stable identifier, e.g. growth-monthly.")
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, max_length=2000)
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    currency = models.CharField(max_length=3, default="INR")
    interval = models.CharField(max_length=10, choices=BillingInterval.choices)
    tier_rank = models.PositiveSmallIntegerField(
        default=0, help_text="Higher = more capable plan. Decides upgrade vs downgrade between tiers."
    )

    # Limits (null = unlimited)
    max_catalogues = models.PositiveIntegerField(null=True, blank=True)
    max_products = models.PositiveIntegerField(null=True, blank=True)
    max_staff = models.PositiveIntegerField(null=True, blank=True, help_text="Team seats incl. owners and pending invitations.")
    storage_limit_mb = models.PositiveIntegerField(null=True, blank=True)
    max_image_size_mb = models.PositiveIntegerField(null=True, blank=True)
    video_uploads_enabled = models.BooleanField(default=False)
    max_video_size_mb = models.PositiveIntegerField(null=True, blank=True)
    # Feature flags
    custom_branding = models.BooleanField(default=False)
    analytics_enabled = models.BooleanField(default=False)
    csv_import_enabled = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True, help_text="Inactive plans cannot be purchased.")
    is_public = models.BooleanField(default=True, help_text="Hidden plans are not listed on the pricing page.")
    is_development_seed = models.BooleanField(
        default=False, help_text="Placeholder data from seed_dev_plans. Never offered when the mock provider is off."
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["interval", "sort_order", "price"]

    def __str__(self):
        return f"{self.name} ({self.price} {self.currency}/{self.interval})"

    def limits_snapshot(self) -> dict:
        return {field: getattr(self, field) for field in LIMIT_FIELDS}

    def is_upgrade_from(self, other: "Plan | Subscription") -> bool:
        """Higher tier, or the same tier on a longer interval."""
        other_rank = other.tier_rank if isinstance(other, Plan) else other.plan_tier_rank
        other_interval = other.interval if isinstance(other, Plan) else other.plan_interval
        if self.tier_rank != other_rank:
            return self.tier_rank > other_rank
        return INTERVAL_DAYS[self.interval] > INTERVAL_DAYS[other_interval]


class Subscription(UUIDModel):
    class Status(models.TextChoices):
        PENDING_PAYMENT = "pending_payment", "Pending payment"  # checkout created, no verified payment yet
        SCHEDULED = "scheduled", "Scheduled"  # paid, starts at the end of the current period
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past due"  # period ended unpaid; access during grace period
        CANCELLED = "cancelled", "Cancelled"  # ended at period end after the customer cancelled
        EXPIRED = "expired", "Expired"  # not renewed before the grace period ended
        SUPERSEDED = "superseded", "Superseded"  # replaced by a plan change
        ABANDONED = "abandoned", "Abandoned"  # checkout never paid (expired or replaced)

    CURRENT_STATUSES = (Status.ACTIVE, Status.PAST_DUE)
    TERMINAL_STATUSES = (Status.CANCELLED, Status.EXPIRED, Status.SUPERSEDED, Status.ABANDONED)

    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_PAYMENT)

    # Immutable snapshot of what was purchased.
    plan_code = models.CharField(max_length=60)
    plan_name = models.CharField(max_length=100)
    plan_price = models.DecimalField(max_digits=12, decimal_places=2)
    plan_currency = models.CharField(max_length=3)
    plan_interval = models.CharField(max_length=10, choices=BillingInterval.choices)
    plan_tier_rank = models.PositiveSmallIntegerField(default=0)
    limits = models.JSONField(default=dict)

    starts_at = models.DateTimeField(null=True, blank=True, help_text="When a scheduled subscription takes over.")
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    abandoned_reason = models.CharField(max_length=20, blank=True)  # "expired" | "replaced" | "cancelled"

    # A downgrade chosen by the customer, applied when they pay for the next period.
    pending_plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    replaces = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Never two current subscriptions, pending checkouts or scheduled changes for one business.
            models.UniqueConstraint(
                fields=["business"], condition=Q(status__in=["active", "past_due"]), name="billing_one_current_sub"
            ),
            models.UniqueConstraint(
                fields=["business"], condition=Q(status="pending_payment"), name="billing_one_pending_sub"
            ),
            models.UniqueConstraint(fields=["business"], condition=Q(status="scheduled"), name="billing_one_scheduled_sub"),
        ]
        indexes = [models.Index(fields=["business", "status"], name="billing_sub_biz_status")]

    def __str__(self):
        return f"{self.plan_name} for {self.business_id} [{self.status}]"

    @classmethod
    def snapshot_fields(cls, plan: Plan) -> dict:
        return {
            "plan": plan,
            "plan_code": plan.code,
            "plan_name": plan.name,
            "plan_price": plan.price,
            "plan_currency": plan.currency,
            "plan_interval": plan.interval,
            "plan_tier_rank": plan.tier_rank,
            "limits": plan.limits_snapshot(),
        }

    @property
    def is_current(self) -> bool:
        return self.status in self.CURRENT_STATUSES


class Payment(UUIDModel):
    class Kind(models.TextChoices):
        NEW = "new", "New subscription"
        RENEWAL = "renewal", "Renewal"
        PLAN_CHANGE = "plan_change", "Plan change (immediate)"
        SCHEDULED_CHANGE = "scheduled_change", "Plan change at period end"

    class Status(models.TextChoices):
        CREATED = "created", "Awaiting payment"
        CAPTURED = "captured", "Paid"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"  # checkout abandoned before payment

    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="payments")
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="payments")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED)

    provider = models.CharField(max_length=30)
    is_test = models.BooleanField(default=False, help_text="Created by the mock provider: no real money moved.")
    provider_order_id = models.CharField(max_length=100)
    provider_payment_id = models.CharField(max_length=100, blank=True)
    # Public data the browser needs to open the gateway checkout (never secrets).
    checkout_payload = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField(help_text="Unpaid checkouts expire after CHECKOUT_EXPIRY_MINUTES.")

    # Amount breakdown frozen at checkout (the provider is asked for exactly `amount`).
    currency = models.CharField(max_length=3)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_name = models.CharField(max_length=40, blank=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_inclusive = models.BooleanField(default=False)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True, help_text="When the subscription change was applied.")
    failure_code = models.CharField(max_length=60, blank=True)
    failure_message = models.CharField(max_length=255, blank=True)
    requires_attention = models.BooleanField(default=False, db_index=True)
    attention_reason = models.CharField(max_length=255, blank=True)
    last_reconciled_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_order_id"], name="billing_payment_order_unique"),
            models.UniqueConstraint(
                fields=["provider", "provider_payment_id"],
                condition=~Q(provider_payment_id=""),
                name="billing_payment_provider_payment_unique",
            ),
            # At most one open (unpaid) checkout per business.
            models.UniqueConstraint(fields=["business"], condition=Q(status="created"), name="billing_one_open_checkout"),
        ]
        indexes = [
            models.Index(fields=["business", "status"], name="billing_pay_biz_status"),
            # Platform revenue aggregation (Super Admin dashboard): captured payments by paid date.
            models.Index(fields=["status", "paid_at"], name="billing_pay_status_paid"),
        ]

    def __str__(self):
        return f"{self.amount} {self.currency} [{self.status}] {self.provider_order_id}"


class PaymentEvent(models.Model):
    """
    Ledger of provider webhooks/reconciliations. The (provider, event_id) unique constraint makes
    processing idempotent. Only a sanitised summary is stored, never the raw payload.
    """

    class Outcome(models.TextChoices):
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"

    id = models.BigAutoField(primary_key=True)
    provider = models.CharField(max_length=30)
    event_id = models.CharField(max_length=120)
    event_type = models.CharField(max_length=60)
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    detail = models.CharField(max_length=255, blank=True)
    summary = models.JSONField(default=dict)
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-received_at"]
        constraints = [models.UniqueConstraint(fields=["provider", "event_id"], name="billing_event_unique")]


class InvoiceSequence(models.Model):
    """Gapless per-series, per-year counter; incremented under a row lock."""

    series = models.CharField(max_length=20)  # BILLING_INVOICE_PREFIX, or "TEST" for mock payments
    year = models.PositiveIntegerField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["series", "year"], name="billing_invoice_sequence_unique")]


class Invoice(UUIDModel):
    class Status(models.TextChoices):
        PAID = "paid", "Paid"
        VOID = "void", "Void"

    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="invoices")
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="invoices")
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="invoice")
    number = models.CharField(max_length=40, unique=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PAID)
    issued_at = models.DateTimeField()
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)

    currency = models.CharField(max_length=3)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_name = models.CharField(max_length=40, blank=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_inclusive = models.BooleanField(default=False)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    is_test = models.BooleanField(default=False)

    # Party snapshots so later profile edits never rewrite issued invoices.
    seller = models.JSONField(default=dict)
    buyer = models.JSONField(default=dict)

    class Meta:
        ordering = ["-issued_at"]
        indexes = [models.Index(fields=["business", "issued_at"], name="billing_inv_biz_issued")]

    def __str__(self):
        return self.number


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=255)
    plan_code = models.CharField(max_length=60, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]
