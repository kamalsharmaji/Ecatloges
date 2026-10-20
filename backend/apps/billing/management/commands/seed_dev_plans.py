"""
Create PLACEHOLDER plans for local development.

These are not approved prices or limits. Every plan is named "[DEV] …", flagged
is_development_seed=True, and is never offered when the mock payment provider is disabled.
"""
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.billing.models import Plan

NOTE = "Development placeholder — price and limits are NOT approved."

# (code suffix, name, tier, monthly price, limits). Values are arbitrary placeholders.
TIERS = [
    ("basic", "[DEV] Basic", 1, Decimal("100.00"), dict(max_catalogues=2, max_products=50, max_staff=2, storage_limit_mb=500,
                                                        max_image_size_mb=10, video_uploads_enabled=False)),
    ("standard", "[DEV] Standard", 2, Decimal("200.00"), dict(max_catalogues=10, max_products=500, max_staff=5,
                                                              storage_limit_mb=5000, max_image_size_mb=20,
                                                              video_uploads_enabled=True, max_video_size_mb=200,
                                                              analytics_enabled=True, csv_import_enabled=True)),
    ("premium", "[DEV] Premium", 3, Decimal("300.00"), dict(max_catalogues=None, max_products=None, max_staff=20,
                                                            storage_limit_mb=50000, max_image_size_mb=50,
                                                            video_uploads_enabled=True, max_video_size_mb=1000,
                                                            custom_branding=True, analytics_enabled=True,
                                                            csv_import_enabled=True)),
]


class Command(BaseCommand):
    help = "Create clearly marked placeholder plans for development (refuses to run without the mock provider)."

    def handle(self, *args, **options):
        if not settings.PAYMENT_MOCK_ENABLED:
            raise CommandError("Refusing to seed placeholder plans: the mock payment provider is not enabled.")
        currency = settings.BILLING_CURRENCIES[0]
        created = 0
        for order, (suffix, name, tier, monthly, limits) in enumerate(TIERS):
            for interval, price in (("month", monthly), ("year", monthly * 10)):
                _, was_created = Plan.objects.update_or_create(
                    code=f"dev-{suffix}-{interval}",
                    defaults=dict(
                        name=name,
                        description=NOTE,
                        price=price,
                        currency=currency,
                        interval=interval,
                        tier_rank=tier,
                        sort_order=order,
                        is_active=True,
                        is_public=True,
                        is_development_seed=True,
                        **{"max_catalogues": None, "max_products": None, "max_video_size_mb": None,
                           "custom_branding": False, "analytics_enabled": False, "csv_import_enabled": False, **limits},
                    ),
                )
                created += was_created
        self.stdout.write(self.style.WARNING(f"Seeded {len(TIERS) * 2} development placeholder plans ({created} new)."))
