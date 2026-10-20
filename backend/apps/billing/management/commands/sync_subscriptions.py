"""
Apply due subscription transitions for every business (expiry, period end, scheduled changes).

Access checks already sync on read, so this is housekeeping — schedule it every few minutes
(cron / Windows Task Scheduler) so dashboards and emails reflect the right state.
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.billing import events
from apps.billing.models import Payment, Subscription
from apps.billing.services import sync_business


class Command(BaseCommand):
    help = "Apply due subscription lifecycle transitions and send expiry reminders."

    def handle(self, *args, **options):
        business_ids = set(
            Subscription.objects.filter(~Q(status__in=Subscription.TERMINAL_STATUSES)).values_list("business_id", flat=True)
        ) | set(Payment.objects.filter(status=Payment.Status.CREATED).values_list("business_id", flat=True))
        for business_id in business_ids:
            sync_business(business_id)
        self.stdout.write(f"Synced {len(business_ids)} businesses.")
        self.stdout.write(f"Expiry reminders: {self.remind()}.")

    def remind(self) -> int:
        """In-app reminder once per period, N days before an active period ends (dedup key per period)."""
        now = timezone.now()
        horizon = now + timedelta(days=settings.SUBSCRIPTION_REMINDER_DAYS)
        due = Subscription.objects.select_related("business").filter(
            status=Subscription.Status.ACTIVE, current_period_end__gt=now, current_period_end__lte=horizon
        )
        sent = 0
        for sub in due:
            # A paid change starting at period end means nothing is about to lapse.
            if Subscription.objects.filter(business=sub.business, status=Subscription.Status.SCHEDULED).exists():
                continue
            with transaction.atomic():
                events.expiring_soon(sub, max((sub.current_period_end - now).days, 0) or 1)
            sent += 1
        return sent
