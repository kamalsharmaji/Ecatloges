from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from apps.audit_logs.models import AuditLog
from apps.billing.models import Subscription
from apps.billing.services import sync_business
from apps.notifications.models import Notification

from .conftest import checkout, send_webhook


def test_payment_notifications_survive_webhook_redelivery(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    for _ in range(2):  # gateway retries the same event
        assert send_webhook(payment, event_id="evt_same").status_code == 200
    # A second, different event for the same capture is ignored as well.
    assert send_webhook(payment, event_id="evt_other").status_code == 200

    owner = shop["owner"]
    assert Notification.objects.filter(recipient=owner, event="payment.captured").count() == 1
    assert Notification.objects.filter(recipient=owner, event="invoice.issued").count() == 1
    actions = list(AuditLog.objects.filter(business=shop["business"]).values_list("action", flat=True))
    assert actions.count("payment.captured") == 1 and actions.count("subscription.activated") == 1
    entry = AuditLog.objects.get(action="payment.captured")
    assert entry.actor is None and entry.actor_type == "system"


def test_failed_payment_notifies_once(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment, "failed", event_id="evt_f1")
    send_webhook(payment, "failed", event_id="evt_f2")
    assert Notification.objects.filter(event="payment.failed").count() == 1
    note = Notification.objects.get(event="payment.failed")
    assert note.level == "error" and note.business_id == shop["business"].pk


def test_period_end_and_expiry_reminder(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment)
    sub = Subscription.objects.get(business=shop["business"], status="active")

    # Reminder N days before the end — once per period, however often the job runs.
    Subscription.objects.filter(pk=sub.pk).update(current_period_end=timezone.now() + timedelta(days=3))
    call_command("sync_subscriptions", stdout=StringIO())
    call_command("sync_subscriptions", stdout=StringIO())
    assert Notification.objects.filter(event="subscription.expiring").count() == 1

    Subscription.objects.filter(pk=sub.pk).update(current_period_end=timezone.now() - timedelta(minutes=1))
    sync_business(shop["business"].pk)
    sync_business(shop["business"].pk)
    assert Notification.objects.filter(event="subscription.past_due").count() == 1
    assert AuditLog.objects.filter(action="subscription.past_due", business=shop["business"]).count() == 1


def test_owner_cancel_is_audited_with_actor(shop):
    payment = checkout(shop["client"], shop["plans"]["basic"])
    send_webhook(payment)
    assert shop["client"].post("/api/v1/billing/subscription/cancel/").status_code == 200
    entry = AuditLog.objects.get(action="subscription.cancel_requested")
    assert entry.actor == shop["owner"] and entry.business == shop["business"]
