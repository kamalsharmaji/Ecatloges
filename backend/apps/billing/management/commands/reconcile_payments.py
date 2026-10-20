"""Ask the gateway about recent unpaid/failed checkouts in case a webhook was missed."""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing.models import Payment
from apps.billing.services import PaymentProviderFailure, reconcile_payment


class Command(BaseCommand):
    help = "Reconcile recent open/failed payments with the payment provider."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=48, help="Look back this many hours (default 48).")

    def handle(self, *args, hours, **options):
        since = timezone.now() - timedelta(hours=hours)
        payments = Payment.objects.filter(
            created_at__gte=since,
            status__in=[Payment.Status.CREATED, Payment.Status.FAILED, Payment.Status.EXPIRED],
        )
        ok = failed = 0
        for payment in payments:
            try:
                reconcile_payment(payment)
                ok += 1
            except PaymentProviderFailure:
                failed += 1
        self.stdout.write(f"Reconciled {ok} payments; {failed} could not reach the provider.")
