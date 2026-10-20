"""
Customers and enquiries (leads).

Matching policy (apps/enquiries/services.py): within one business a submitted enquiry reuses the
customer with the same normalised phone number; failing that, the same email (case-insensitive);
otherwise a new customer is created. Each enquiry keeps a snapshot of the contact details exactly as
submitted, so history survives customer edits or deletion.
"""
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.core.models import UUIDModel


class Customer(UUIDModel):
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True, help_text="Normalised: optional leading + then digits.")
    email = models.EmailField(blank=True)
    company = models.CharField(max_length=150, blank=True)
    city = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True, max_length=2000)
    last_enquiry_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-last_enquiry_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["business", "phone"], condition=~Q(phone=""), name="enquiries_customer_phone_unique"
            ),
            models.UniqueConstraint(
                Lower("email"), "business", condition=~Q(email=""), name="enquiries_customer_email_ci_unique"
            ),
        ]
        indexes = [models.Index(fields=["business", "-created_at"], name="customer_biz_created")]

    def __str__(self):
        return self.name


class EnquiryStatus(models.TextChoices):
    NEW = "new", "New"
    CONTACTED = "contacted", "Contacted"
    IN_PROGRESS = "in_progress", "In progress"
    CONVERTED = "converted", "Converted"
    CLOSED = "closed", "Closed"


class EnquirySource(models.TextChoices):
    CATALOGUE = "catalogue", "Catalogue link"
    QR_CODE = "qr_code", "QR code"
    WHATSAPP = "whatsapp", "WhatsApp share"
    SOCIAL = "social", "Social media"
    SEARCH = "search", "Search engine"
    MANUAL = "manual", "Added manually"


class Enquiry(UUIDModel):
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="enquiries")
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="enquiries")
    catalogue = models.ForeignKey(
        "catalogues.Catalogue", null=True, blank=True, on_delete=models.SET_NULL, related_name="enquiries"
    )
    product = models.ForeignKey("products.Product", null=True, blank=True, on_delete=models.SET_NULL, related_name="enquiries")

    # Snapshot of what the visitor submitted (kept even if the customer/product changes or is deleted).
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    message = models.TextField(max_length=2000)
    quantity = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    product_name = models.CharField(max_length=200, blank=True)
    catalogue_name = models.CharField(max_length=150, blank=True)

    source = models.CharField(max_length=20, choices=EnquirySource.choices, default=EnquirySource.CATALOGUE)
    status = models.CharField(max_length=20, choices=EnquiryStatus.choices, default=EnquiryStatus.NEW)
    status_changed_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True, help_text="Set when status first becomes Converted.")
    internal_notes = models.TextField(blank=True, max_length=5000)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    # Client-generated key: a retried submission returns the original enquiry instead of a duplicate.
    idempotency_key = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "enquiries"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "idempotency_key"], condition=~Q(idempotency_key=""), name="enquiries_idempotency_unique"
            ),
        ]
        indexes = [
            models.Index(fields=["business", "status"], name="enquiry_biz_status"),
            models.Index(fields=["business", "-created_at"], name="enquiry_biz_created"),
            models.Index(fields=["business", "catalogue"], name="enquiry_biz_catalogue"),
        ]

    def __str__(self):
        return f"{self.name} → {self.product_name or self.catalogue_name}"
