"""
Audit entries and in-app notifications for billing state changes.

Called inside the billing transactions, so a rolled-back or duplicate webhook leaves nothing behind;
dedup keys make a re-delivered event harmless even if it gets this far.
"""
from apps.audit_logs import services as audit
from apps.notifications.models import NotificationLevel
from apps.notifications.services import notify_members

from .models import Subscription

S = Subscription.Status

SUBSCRIPTION_MESSAGES = {
    S.PAST_DUE: (NotificationLevel.WARNING, "Subscription payment due",
                 "Your {plan} plan period has ended. Renew within the grace period to keep your catalogues online."),
    S.EXPIRED: (NotificationLevel.ERROR, "Subscription expired",
                "Your {plan} plan has expired. Public catalogues are offline until you choose a plan."),
    S.CANCELLED: (NotificationLevel.WARNING, "Subscription ended", "Your {plan} plan has been cancelled."),
    S.ACTIVE: (NotificationLevel.SUCCESS, "Plan change is now active", "You are now on the {plan} plan."),
}


def _money(payment) -> str:
    return f"{payment.currency} {payment.amount:,.2f}"


def payment_failed(payment) -> None:
    audit.record("payment.failed", business=payment.business, target=payment, target_label=f"Payment {_money(payment)}",
                 metadata={"failure_code": payment.failure_code, "provider": payment.provider})
    notify_members(
        payment.business, "subscription.view",
        event="payment.failed", category="payment", level=NotificationLevel.ERROR,
        title="Payment failed",
        body=f"Your payment of {_money(payment)} for the {payment.subscription.plan_name} plan did not go through.",
        link="/app/billing", target=payment, dedup_key=f"payment:{payment.pk}:failed",
    )


def payment_applied(payment, subscription, invoice) -> None:
    label = f"Payment {_money(payment)}"
    audit.record("payment.captured", business=payment.business, target=payment, target_label=label,
                 metadata={"provider": payment.provider, "kind": payment.kind, "plan": subscription.plan_name})
    action = "subscription.change_scheduled" if subscription.status == S.SCHEDULED else (
        "subscription.renewed" if payment.kind == payment.Kind.RENEWAL else "subscription.activated"
    )
    audit.record(action, business=payment.business, target=subscription, target_label=subscription.plan_name,
                 metadata={"period_end": subscription.current_period_end})
    notify_members(
        payment.business, "subscription.view",
        event="payment.captured", category="payment", level=NotificationLevel.SUCCESS,
        title="Payment successful",
        body=f"{_money(payment)} received for the {subscription.plan_name} plan.",
        link="/app/billing", target=payment, dedup_key=f"payment:{payment.pk}:captured",
    )
    if invoice is not None:
        audit.record("invoice.issued", business=payment.business, target=invoice, target_label=invoice.number)
        notify_members(
            payment.business, "invoice.view",
            event="invoice.issued", category="payment", level=NotificationLevel.SUCCESS,
            title="Invoice generated", body=f"Invoice {invoice.number} is ready to download.",
            link=f"/app/billing/invoices/{invoice.pk}", target=invoice, dedup_key=f"invoice:{invoice.pk}",
        )


def subscription_changed(subscription, old_status: str, *, actor=None, platform_actor=None) -> None:
    """A status transition (system, owner or platform admin)."""
    if subscription.status == old_status:
        return
    changes = {"status": {"from": old_status, "to": subscription.status}}
    action = f"subscription.{subscription.status}"
    if platform_actor is not None:
        audit.record_platform(platform_actor, action, business=subscription.business, target=subscription,
                              target_label=subscription.plan_name, changes=changes, scope="business")
    else:
        audit.record(action, business=subscription.business, actor=actor, target=subscription,
                     target_label=subscription.plan_name, changes=changes)
    message = SUBSCRIPTION_MESSAGES.get(subscription.status)
    if message is None or (subscription.status == S.ACTIVE and old_status != S.SCHEDULED):
        return
    level, title, body = message
    notify_members(
        subscription.business, "subscription.view",
        event=action, category="subscription", level=level, title=title,
        body=body.format(plan=subscription.plan_name), link="/app/billing", target=subscription,
        dedup_key=f"subscription:{subscription.pk}:{subscription.status}",
    )


def expiring_soon(subscription, days_left: int) -> int:
    """Reminder before the period ends (sent by `manage.py sync_subscriptions`)."""
    return notify_members(
        subscription.business, "subscription.view",
        event="subscription.expiring", category="subscription", level=NotificationLevel.WARNING,
        title="Subscription expiry reminder",
        body=f"Your {subscription.plan_name} plan ends in {days_left} day{'s' if days_left != 1 else ''}."
        + (" It is set to cancel." if subscription.cancel_at_period_end else " Renew to avoid interruption."),
        link="/app/billing", target=subscription,
        dedup_key=f"subscription:{subscription.pk}:expiring:{subscription.current_period_end:%Y%m%d}",
    )
