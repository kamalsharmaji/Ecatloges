"""
Subscription and payment business rules (provider-independent).

Golden rule: a subscription only becomes active inside `_apply_captured_payment`, which is reached
exclusively from a provider event that was authenticated (signed webhook) or fetched directly from
the gateway (reconciliation). Nothing the browser says can activate a subscription.

Plan-change rules (documented in docs/ARCHITECTURE.md §6):
- new:              no current subscription → pay → active immediately for one interval.
- renewal:          same plan, within RENEWAL_WINDOW_DAYS of period end (or past due) → pay →
                    period extended. Renewals are charged the subscription's snapshot price.
- plan_change:      higher tier / longer interval (or any change while past due) → pay → new
                    subscription active immediately; the old one is superseded (no proration).
- downgrade:        lower tier / shorter interval → scheduled as `pending_plan`; the customer pays
                    for it at renewal (kind `scheduled_change`) and it starts at period end.
- cancel:           active until period end, then `cancelled`. No refunds are issued automatically.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import exceptions

from apps.audit_logs import services as audit
from apps.businesses.models import Business
from apps.core.exceptions import BusinessRuleViolation

from . import entitlements, events
from .invoices import issue_invoice
from .models import Payment, PaymentEvent, Plan, Subscription, add_interval
from .money import compute_tax, from_minor, to_minor
from .providers import ProviderError, ProviderEvent, get_provider, get_provider_by_name

logger = logging.getLogger("apps.billing")
S = Subscription.Status


class EmailNotVerified(exceptions.PermissionDenied):
    default_detail = "Verify your email address before purchasing a subscription."
    default_code = "email_not_verified"


class PaymentProviderFailure(exceptions.APIException):
    status_code = 502
    default_detail = "The payment provider could not be reached. Please try again."
    default_code = "payment_provider_error"


class InvalidWebhookSignature(exceptions.APIException):
    status_code = 400
    default_detail = "Invalid webhook signature."
    default_code = "invalid_signature"


def _rule(message, code):
    return BusinessRuleViolation(message, code=code)


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------
def purchasable_plans():
    qs = Plan.objects.filter(is_active=True, currency__in=settings.BILLING_CURRENCIES)
    if not settings.PAYMENT_MOCK_ENABLED:
        # Development placeholder plans can never be bought for real money.
        qs = qs.filter(is_development_seed=False)
    return qs


# ---------------------------------------------------------------------------
# Lifecycle (date-driven transitions)
# ---------------------------------------------------------------------------
def _abandon(sub: Subscription, reason: str, now: datetime) -> None:
    sub.status = S.ABANDONED
    sub.abandoned_reason = reason
    sub.ended_at = now
    sub.save(update_fields=["status", "abandoned_reason", "ended_at", "updated_at"])


def _expire_open_payments(business_id, reason: str, now: datetime, *, exclude=None) -> None:
    qs = Payment.objects.filter(business_id=business_id, status=Payment.Status.CREATED)
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    for payment in qs.select_for_update():
        payment.status = Payment.Status.EXPIRED
        payment.failure_code = reason
        payment.save(update_fields=["status", "failure_code", "updated_at"])
        sub = payment.subscription
        if sub.status == S.PENDING_PAYMENT:
            _abandon(sub, reason.removeprefix("checkout_"), now)


@transaction.atomic
def sync_business(business_id, now: datetime | None = None) -> None:
    """Apply every transition that is due. Safe to call repeatedly (and on every read)."""
    now = now or timezone.now()
    subs = list(
        Subscription.objects.select_for_update()
        .filter(business_id=business_id)
        .exclude(status__in=Subscription.TERMINAL_STATUSES)
        .order_by("created_at")
    )
    if not subs and not Payment.objects.filter(business_id=business_id, status=Payment.Status.CREATED).exists():
        return

    # 1. Unpaid checkouts past their expiry.
    for payment in Payment.objects.select_for_update().filter(
        business_id=business_id, status=Payment.Status.CREATED, expires_at__lte=now
    ):
        payment.status = Payment.Status.EXPIRED
        payment.failure_code = "checkout_expired"
        payment.save(update_fields=["status", "failure_code", "updated_at"])
    for sub in subs:
        if sub.status == S.PENDING_PAYMENT and not sub.payments.filter(status=Payment.Status.CREATED).exists():
            _abandon(sub, "expired", now)

    current = next((s for s in subs if s.status in Subscription.CURRENT_STATUSES), None)
    scheduled = next((s for s in subs if s.status == S.SCHEDULED), None)

    # 2. A paid scheduled change whose start has arrived takes over.
    if scheduled and scheduled.starts_at and scheduled.starts_at <= now:
        if current:
            current.status = S.SUPERSEDED
            current.ended_at = scheduled.starts_at
            current.save(update_fields=["status", "ended_at", "updated_at"])
        scheduled.status = S.ACTIVE
        scheduled.activated_at = now
        scheduled.save(update_fields=["status", "activated_at", "updated_at"])
        events.subscription_changed(scheduled, S.SCHEDULED)
        current = scheduled

    # 3. Period end → cancelled (if requested) or past due.
    if current and current.status == S.ACTIVE and current.current_period_end and current.current_period_end <= now:
        if current.cancel_at_period_end:
            current.status = S.CANCELLED
            current.ended_at = current.current_period_end
        else:
            current.status = S.PAST_DUE
            current.grace_until = current.current_period_end + timedelta(days=settings.SUBSCRIPTION_GRACE_DAYS)
        current.save(update_fields=["status", "ended_at", "grace_until", "updated_at"])
        events.subscription_changed(current, S.ACTIVE)

    # 4. Grace over → expired.
    if current and current.status == S.PAST_DUE and current.grace_until and current.grace_until <= now:
        current.status = S.EXPIRED
        current.ended_at = current.grace_until
        current.pending_plan = None
        current.save(update_fields=["status", "ended_at", "pending_plan", "updated_at"])
        events.subscription_changed(current, S.PAST_DUE)


def current_subscription(business, now: datetime | None = None) -> Subscription | None:
    sync_business(business.pk, now)
    return Subscription.objects.filter(business=business, status__in=Subscription.CURRENT_STATUSES).first()


# ---------------------------------------------------------------------------
# Quote & checkout
# ---------------------------------------------------------------------------
@dataclass
class Quote:
    plan: Plan
    kind: str
    price: Decimal
    currency: str
    subtotal: Decimal
    tax_amount: Decimal
    total: Decimal
    tax_name: str
    tax_rate: Decimal
    tax_inclusive: bool
    period_start: datetime
    period_end: datetime
    current: Subscription | None
    blockers: list[dict] = field(default_factory=list)

    def block(self, code: str, message: str) -> None:
        self.blockers.append({"code": code, "message": message})


def build_quote(business, plan: Plan, now: datetime | None = None) -> Quote:
    now = now or timezone.now()
    current = current_subscription(business, now)
    scheduled = Subscription.objects.filter(business=business, status=S.SCHEDULED).first()
    price = plan.price
    start = now

    if current is None:
        kind = Payment.Kind.NEW
    elif current.pending_plan_id == plan.id:
        kind = Payment.Kind.SCHEDULED_CHANGE
        start = max(now, current.current_period_end or now)
    elif current.plan_id == plan.id:
        kind = Payment.Kind.RENEWAL
        price = current.plan_price  # renewals keep the purchase-time price
        if current.status == S.ACTIVE and current.current_period_end and current.current_period_end > now:
            start = current.current_period_end
    elif current.status == S.PAST_DUE or plan.is_upgrade_from(current):
        kind = Payment.Kind.PLAN_CHANGE
    else:
        kind = "downgrade"

    rate = Decimal(str(settings.BILLING_TAX_RATE))
    amounts = compute_tax(price, rate_percent=rate, inclusive=settings.BILLING_PRICES_INCLUDE_TAX)
    quote = Quote(
        plan=plan,
        kind=kind,
        price=price,
        currency=plan.currency,
        subtotal=amounts["subtotal"],
        tax_amount=amounts["tax_amount"],
        total=amounts["total"],
        tax_name=settings.BILLING_TAX_NAME if rate > 0 else "",
        tax_rate=rate if rate > 0 else Decimal("0"),
        tax_inclusive=settings.BILLING_PRICES_INCLUDE_TAX and rate > 0,
        period_start=start,
        period_end=add_interval(start, current.plan_interval if kind == Payment.Kind.RENEWAL else plan.interval),
        current=current,
    )

    # Renewals are allowed even if the plan was retired since (the customer keeps their plan).
    if kind != Payment.Kind.RENEWAL and not purchasable_plans().filter(pk=plan.pk).exists():
        quote.block("plan_unavailable", "This plan is not available for purchase.")
    if kind == "downgrade":
        quote.block(
            "downgrade_must_be_scheduled",
            "Downgrades take effect at the end of your current period. Schedule the change instead.",
        )
    if kind in (Payment.Kind.RENEWAL, Payment.Kind.SCHEDULED_CHANGE) and current.status == S.ACTIVE:
        window = timedelta(days=settings.RENEWAL_WINDOW_DAYS)
        if current.current_period_end and current.current_period_end - now > window:
            quote.block(
                "renewal_not_due",
                f"You can renew within {settings.RENEWAL_WINDOW_DAYS} days of your period end.",
            )
    if scheduled:
        quote.block("change_already_scheduled", "A paid plan change is already scheduled.")
    if quote.total <= 0:
        quote.block("free_plan_not_purchasable", "This plan has no price and cannot be purchased online.")
    for violation in entitlements.limit_violations(business, plan.limits_snapshot()):
        quote.block(
            "usage_exceeds_plan",
            f"You use {violation['used']} {entitlements.LIMIT_LABELS.get(violation['limit'], violation['limit'])}"
            f" but this plan allows {violation['allowed']}. Reduce usage first.",
        )
    return quote


@transaction.atomic
def start_checkout(ctx, *, user, plan: Plan) -> Payment:
    if not user.is_email_verified:
        raise EmailNotVerified()
    # Serialise checkouts per business (double clicks, two tabs).
    Business.objects.select_for_update().get(pk=ctx.business.pk)
    now = timezone.now()
    quote = build_quote(ctx.business, plan, now)
    if quote.blockers:
        first = quote.blockers[0]
        raise _rule(first["message"], first["code"])
    provider = get_provider()

    # Idempotency: an identical open checkout is returned as-is.
    open_payment = Payment.objects.select_for_update().filter(
        business=ctx.business, status=Payment.Status.CREATED
    ).first()
    if open_payment and (
        open_payment.subscription.plan_id == plan.id
        and open_payment.kind == quote.kind
        and open_payment.amount == quote.total
        and open_payment.provider == provider.name
    ):
        return open_payment

    if open_payment:
        # A different (or failed-and-retried) checkout replaces the open one.
        open_payment.status = Payment.Status.EXPIRED
        open_payment.failure_code = "checkout_replaced"
        open_payment.save(update_fields=["status", "failure_code", "updated_at"])

    if quote.kind == Payment.Kind.RENEWAL:
        subscription = quote.current
    else:
        pending = Subscription.objects.select_for_update().filter(business=ctx.business, status=S.PENDING_PAYMENT).first()
        if pending and pending.plan_id == plan.id:
            subscription = pending
        else:
            if pending:
                _abandon(pending, "replaced", now)
            subscription = Subscription.objects.create(
                business=ctx.business,
                status=S.PENDING_PAYMENT,
                replaces=quote.current,
                created_by=user,
                **Subscription.snapshot_fields(plan),
            )

    payment = Payment(
        business=ctx.business,
        subscription=subscription,
        kind=quote.kind,
        provider=provider.name,
        is_test=provider.is_test,
        currency=quote.currency,
        subtotal=quote.subtotal,
        tax_name=quote.tax_name,
        tax_rate=quote.tax_rate,
        tax_inclusive=quote.tax_inclusive,
        tax_amount=quote.tax_amount,
        amount=quote.total,
        period_start=quote.period_start,
        period_end=quote.period_end,
        expires_at=now + timedelta(minutes=settings.CHECKOUT_EXPIRY_MINUTES),
        created_by=user,
    )
    try:
        order = provider.create_order(
            reference=str(payment.id),
            amount_minor=to_minor(payment.amount),
            currency=payment.currency,
            notes={"payment_id": str(payment.id), "business_id": str(ctx.business.pk)},
        )
    except ProviderError as exc:
        logger.error("Payment provider order creation failed", extra={"provider": provider.name, "error": str(exc)})
        raise PaymentProviderFailure() from None
    payment.provider_order_id = order.order_id
    payment.checkout_payload = order.client_payload
    payment.save()
    logger.info(
        "Checkout started",
        extra={"payment_id": str(payment.id), "kind": payment.kind, "business_id": str(ctx.business.pk)},
    )
    return payment


@transaction.atomic
def cancel_checkout(payment: Payment) -> Payment:
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status != Payment.Status.CREATED:
        raise _rule("Only an unpaid checkout can be cancelled.", "checkout_not_open")
    payment.status = Payment.Status.EXPIRED
    payment.failure_code = "checkout_cancelled"
    payment.save(update_fields=["status", "failure_code", "updated_at"])
    if payment.subscription.status == S.PENDING_PAYMENT:
        _abandon(payment.subscription, "cancelled", timezone.now())
    return payment


# ---------------------------------------------------------------------------
# Verified provider events
# ---------------------------------------------------------------------------
def process_webhook(provider_name: str, body: bytes, headers) -> str:
    provider = get_provider_by_name(provider_name)
    if not provider.verify_webhook(body, headers):
        # Never log the body: it is unauthenticated input and may contain customer data.
        logger.warning("Rejected webhook with invalid signature", extra={"provider": provider_name})
        raise InvalidWebhookSignature()
    try:
        event = provider.parse_webhook(body, headers)
    except (ValueError, KeyError, TypeError):
        raise exceptions.ValidationError({"body": ["Malformed webhook payload."]}) from None
    if event is None:
        return "ignored"
    return record_event(provider_name, event)


def record_event(provider_name: str, event: ProviderEvent) -> str:
    """Idempotently apply one authenticated provider event. Returns the outcome label."""
    with transaction.atomic():
        if PaymentEvent.objects.filter(provider=provider_name, event_id=event.event_id).exists():
            return "duplicate"
        payment = (
            Payment.objects.select_for_update()
            .filter(provider=provider_name, provider_order_id=event.order_id)
            .first()
        )
        outcome, detail = (PaymentEvent.Outcome.IGNORED, "unknown order") if payment is None else _apply_event(payment, event)
        try:
            with transaction.atomic():
                PaymentEvent.objects.create(
                    provider=provider_name,
                    event_id=event.event_id,
                    event_type=event.event_type[:60],
                    payment=payment,
                    outcome=outcome,
                    detail=detail[:255],
                    summary=event.summary(),
                )
        except IntegrityError:
            # A concurrent delivery of the same event won the race; roll back our changes.
            transaction.set_rollback(True)
            return "duplicate"
    logger.info("Payment event processed", extra={"provider": provider_name, "outcome": outcome, "detail": detail})
    return outcome


def _flag(payment: Payment, reason: str) -> None:
    payment.requires_attention = True
    payment.attention_reason = reason[:255]
    logger.error("Payment requires attention", extra={"payment_id": str(payment.id), "reason": reason})


def _apply_event(payment: Payment, event: ProviderEvent) -> tuple[str, str]:
    P = Payment.Status
    if event.status == "failed":
        if payment.status == P.CAPTURED:
            return PaymentEvent.Outcome.IGNORED, "failure after capture (out of order)"
        already_failed = payment.status == P.FAILED
        payment.status = P.FAILED
        payment.failure_code = event.failure_code or "payment_failed"
        payment.failure_message = event.failure_message
        payment.save(update_fields=["status", "failure_code", "failure_message", "updated_at"])
        if not already_failed:
            events.payment_failed(payment)
        return PaymentEvent.Outcome.PROCESSED, "payment failed"

    if event.status != "captured":
        return PaymentEvent.Outcome.IGNORED, f"status {event.status}"

    if payment.status == P.CAPTURED:
        if event.payment_id and payment.provider_payment_id and event.payment_id != payment.provider_payment_id:
            _flag(payment, f"Second capture {event.payment_id} for an already paid order — refund required.")
            payment.save(update_fields=["requires_attention", "attention_reason", "updated_at"])
            return PaymentEvent.Outcome.PROCESSED, "duplicate capture flagged"
        return PaymentEvent.Outcome.IGNORED, "already captured"

    # Verify exactly what we asked for was paid.
    expected_minor = to_minor(payment.amount)
    if event.amount_minor != expected_minor or event.currency != payment.currency:
        got = f"{from_minor(event.amount_minor) if event.amount_minor is not None else '?'} {event.currency or '?'}"
        payment.failure_code = "amount_mismatch"
        payment.failure_message = f"Expected {payment.amount} {payment.currency}, provider reported {got}."
        _flag(payment, payment.failure_message)
        payment.save(update_fields=["failure_code", "failure_message", "requires_attention", "attention_reason", "updated_at"])
        return PaymentEvent.Outcome.PROCESSED, "amount or currency mismatch — not activated"

    payment.status = P.CAPTURED
    payment.paid_at = event.occurred_at or timezone.now()
    payment.provider_payment_id = event.payment_id[:100]
    payment.failure_code = ""
    payment.failure_message = ""
    payment.save()
    applied = _apply_captured_payment(payment)
    return PaymentEvent.Outcome.PROCESSED, "captured and applied" if applied else "captured; needs review"


def _apply_captured_payment(payment: Payment) -> bool:
    """Turn a verified, correctly paid payment into subscription access. Idempotent."""
    if payment.applied_at:
        return True
    now = timezone.now()
    sync_business(payment.business_id, now)
    sub = Subscription.objects.select_for_update().get(pk=payment.subscription_id)
    current = (
        Subscription.objects.select_for_update()
        .filter(business_id=payment.business_id, status__in=Subscription.CURRENT_STATUSES)
        .exclude(pk=sub.pk)
        .first()
    )
    K = Payment.Kind

    def needs_review(reason: str) -> bool:
        _flag(payment, reason)
        payment.save(update_fields=["requires_attention", "attention_reason", "updated_at"])
        return False

    if payment.kind == K.RENEWAL:
        if sub.status not in Subscription.CURRENT_STATUSES:
            return needs_review(f"Renewal paid for a subscription that is {sub.status} — review or refund.")
        if sub.status == S.ACTIVE and sub.current_period_end and sub.current_period_end > now:
            period_start = sub.current_period_end
        else:
            period_start = now
            sub.current_period_start = now
        sub.current_period_end = add_interval(period_start, sub.plan_interval)
        sub.status = S.ACTIVE
        sub.grace_until = None
        sub.cancel_at_period_end = False
        sub.cancelled_at = None
        sub.save()
    else:
        resumable = sub.status == S.PENDING_PAYMENT or (sub.status == S.ABANDONED and sub.abandoned_reason == "expired")
        if not resumable:
            return needs_review(f"Payment received for a checkout that was {sub.abandoned_reason or sub.status}.")
        if payment.kind == K.NEW and current is not None:
            return needs_review("Business already has an active subscription — possible double purchase.")
        if Subscription.objects.filter(business_id=payment.business_id, status=S.SCHEDULED).exclude(pk=sub.pk).exists():
            return needs_review("Another plan change is already scheduled.")
        # Other open checkouts are now pointless.
        _expire_open_payments(payment.business_id, "checkout_replaced", now, exclude=payment)
        for other in Subscription.objects.select_for_update().filter(
            business_id=payment.business_id, status=S.PENDING_PAYMENT
        ).exclude(pk=sub.pk):
            _abandon(other, "replaced", now)

        start = now
        if payment.kind == K.SCHEDULED_CHANGE and current and current.current_period_end and current.current_period_end > now:
            start = current.current_period_end
        sub.current_period_start = start
        sub.current_period_end = add_interval(start, sub.plan_interval)
        sub.abandoned_reason = ""
        sub.ended_at = None
        if start > now:
            sub.status = S.SCHEDULED
            sub.starts_at = start
            sub.save()
            current.pending_plan = None
            current.cancel_at_period_end = False
            current.save(update_fields=["pending_plan", "cancel_at_period_end", "updated_at"])
        else:
            if current is not None:
                current.status = S.SUPERSEDED
                current.ended_at = now
                current.save(update_fields=["status", "ended_at", "updated_at"])
            sub.status = S.ACTIVE
            sub.starts_at = now
            sub.activated_at = now
            sub.save()
        period_start = start

    payment.period_start = period_start
    payment.period_end = sub.current_period_end
    payment.applied_at = now
    payment.save(update_fields=["period_start", "period_end", "applied_at", "updated_at"])
    invoice = issue_invoice(payment)
    events.payment_applied(payment, sub, invoice)
    logger.info("Subscription updated from payment", extra={"payment_id": str(payment.id), "subscription_id": str(sub.id)})
    return True


def reconcile_payment(payment: Payment) -> Payment:
    """Ask the gateway for the order's real state and apply it through the same event path."""
    provider = get_provider_by_name(payment.provider)
    try:
        events = provider.fetch_order_events(payment.provider_order_id)
    except ProviderError as exc:
        logger.error("Reconciliation failed", extra={"payment_id": str(payment.id), "error": str(exc)})
        raise PaymentProviderFailure() from None
    # Apply failures first so a later capture (retry) wins.
    for event in sorted(events, key=lambda e: e.status == "captured"):
        record_event(payment.provider, event)
    Payment.objects.filter(pk=payment.pk).update(last_reconciled_at=timezone.now())
    payment.refresh_from_db()
    return payment


def confirm_from_client(payment: Payment, data: dict) -> Payment:
    """Browser says "I paid": verify its provider signature, then reconcile with the gateway."""
    provider = get_provider_by_name(payment.provider)
    if provider.verify_client_confirmation(payment, data) is None:
        raise InvalidWebhookSignature("Payment confirmation could not be verified.")
    return reconcile_payment(payment)


# ---------------------------------------------------------------------------
# Customer actions on the current subscription
# ---------------------------------------------------------------------------
def _locked_current(business) -> Subscription:
    sync_business(business.pk)
    sub = (
        Subscription.objects.select_for_update()
        .filter(business=business, status__in=Subscription.CURRENT_STATUSES)
        .first()
    )
    if sub is None:
        raise _rule("There is no active subscription.", "no_active_subscription")
    return sub


@transaction.atomic
def cancel_subscription(business, *, actor=None) -> Subscription:
    sub = _locked_current(business)
    if sub.status != S.ACTIVE:
        raise _rule("Only an active subscription can be cancelled.", "not_cancellable")
    if Subscription.objects.filter(business=business, status=S.SCHEDULED).exists():
        raise _rule("A paid plan change is scheduled. Contact support to cancel it.", "scheduled_change_exists")
    sub.cancel_at_period_end = True
    sub.cancelled_at = timezone.now()
    sub.pending_plan = None
    sub.save(update_fields=["cancel_at_period_end", "cancelled_at", "pending_plan", "updated_at"])
    _expire_open_payments(business.pk, "checkout_cancelled", timezone.now())
    audit.record("subscription.cancel_requested", business=business, actor=actor, target=sub,
                 target_label=sub.plan_name, metadata={"ends_at": sub.current_period_end})
    return sub


@transaction.atomic
def resume_subscription(business, *, actor=None) -> Subscription:
    sub = _locked_current(business)
    if not sub.cancel_at_period_end or sub.status != S.ACTIVE:
        raise _rule("This subscription is not scheduled to cancel.", "not_cancelling")
    sub.cancel_at_period_end = False
    sub.cancelled_at = None
    sub.save(update_fields=["cancel_at_period_end", "cancelled_at", "updated_at"])
    audit.record("subscription.resumed", business=business, actor=actor, target=sub, target_label=sub.plan_name)
    return sub


@transaction.atomic
def schedule_downgrade(business, plan: Plan, *, actor=None) -> Subscription:
    sub = _locked_current(business)
    if sub.status != S.ACTIVE:
        raise _rule("Renew your subscription before changing plans.", "not_active")
    if plan.id == sub.plan_id:
        raise _rule("You are already on this plan.", "same_plan")
    if not purchasable_plans().filter(pk=plan.pk).exists():
        raise _rule("This plan is not available for purchase.", "plan_unavailable")
    if plan.is_upgrade_from(sub):
        raise _rule("Upgrades take effect immediately — use checkout instead.", "upgrade_requires_checkout")
    if Subscription.objects.filter(business=business, status=S.SCHEDULED).exists():
        raise _rule("A paid plan change is already scheduled.", "change_already_scheduled")
    violations = entitlements.limit_violations(business, plan.limits_snapshot())
    if violations:
        v = violations[0]
        raise _rule(
            f"You use {v['used']} {entitlements.LIMIT_LABELS.get(v['limit'], v['limit'])} but this plan allows "
            f"{v['allowed']}. Reduce usage first.",
            "usage_exceeds_plan",
        )
    sub.pending_plan = plan
    sub.cancel_at_period_end = False
    sub.save(update_fields=["pending_plan", "cancel_at_period_end", "updated_at"])
    audit.record("subscription.downgrade_scheduled", business=business, actor=actor, target=sub,
                 target_label=sub.plan_name, changes={"plan": {"from": sub.plan_name, "to": plan.name}})
    return sub


@transaction.atomic
def clear_scheduled_downgrade(business, *, actor=None) -> Subscription:
    sub = _locked_current(business)
    if sub.pending_plan_id is None:
        raise _rule("No plan change is scheduled.", "no_scheduled_change")
    sub.pending_plan = None
    sub.save(update_fields=["pending_plan", "updated_at"])
    _expire_open_payments(business.pk, "checkout_cancelled", timezone.now())
    audit.record("subscription.scheduled_change_cleared", business=business, actor=actor, target=sub,
                 target_label=sub.plan_name)
    return sub


@transaction.atomic
def admin_cancel_subscription(subscription: Subscription, *, immediately: bool, actor) -> Subscription:
    sub = Subscription.objects.select_for_update().get(pk=subscription.pk)
    old_status = sub.status
    if sub.status not in (*Subscription.CURRENT_STATUSES, S.SCHEDULED):
        raise _rule("This subscription is not active.", "not_cancellable")
    now = timezone.now()
    if immediately:
        sub.status = S.CANCELLED
        sub.ended_at = now
    else:
        sub.cancel_at_period_end = True
    sub.cancelled_at = now
    sub.pending_plan = None
    sub.save()
    if sub.status != old_status:
        events.subscription_changed(sub, old_status, platform_actor=actor)
    else:
        audit.record_platform(actor, "subscription.cancel_requested", business=sub.business, target=sub,
                              target_label=sub.plan_name, scope="business")
    logger.warning(
        "Subscription cancelled by platform admin",
        extra={"subscription_id": str(sub.id), "actor_id": str(actor.id), "immediately": immediately},
    )
    return sub
