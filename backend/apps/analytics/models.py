"""
Public catalogue analytics events.

A *view* is recorded only when the public catalogue page's own JavaScript reports it (not on API
requests), for a published catalogue/product, at most once per visitor + item per 30 minutes, and
never for user agents that identify as bots or link previewers. Numbers are therefore approximate.

Privacy: no IP address, user agent or cookie value is stored. `visitor_key` is
HMAC(SECRET_KEY, business id + random browser id) — stable per business, not linkable across
businesses, and meaningless without the server secret. `device` is a coarse class (mobile/tablet/desktop).
"""
from django.db import models


class EventType(models.TextChoices):
    CATALOGUE_VIEW = "catalogue_view", "Catalogue view"
    PRODUCT_VIEW = "product_view", "Product view"


class TrafficSource(models.TextChoices):
    DIRECT = "direct", "Direct"
    QR_CODE = "qr_code", "QR code"
    WHATSAPP = "whatsapp", "WhatsApp"
    SOCIAL = "social", "Social media"
    SEARCH = "search", "Search engines"
    OTHER = "other", "Others"


class Device(models.TextChoices):
    MOBILE = "mobile", "Mobile"
    TABLET = "tablet", "Tablet"
    DESKTOP = "desktop", "Desktop"
    OTHER = "other", "Others"


class AnalyticsEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="analytics_events")
    catalogue = models.ForeignKey("catalogues.Catalogue", on_delete=models.CASCADE, related_name="analytics_events")
    product = models.ForeignKey(
        "products.Product", null=True, blank=True, on_delete=models.CASCADE, related_name="analytics_events"
    )
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    source = models.CharField(max_length=20, choices=TrafficSource.choices, default=TrafficSource.DIRECT)
    device = models.CharField(max_length=10, choices=Device.choices, default=Device.OTHER)
    visitor_key = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["business", "event_type", "created_at"], name="analytics_biz_type_time"),
            models.Index(fields=["catalogue", "created_at"], name="analytics_catalogue_time"),
            models.Index(fields=["product", "created_at"], name="analytics_product_time"),
            # Dedup lookups ("same visitor, same item, last 30 minutes").
            models.Index(fields=["visitor_key", "catalogue", "event_type", "created_at"], name="analytics_dedup"),
        ]
