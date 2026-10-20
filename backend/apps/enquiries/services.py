import logging
import re
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import exceptions

from apps.audit_logs import services as audit
from apps.audit_logs.models import ActorType
from apps.notifications.emails import send_email
from apps.notifications.services import notify_members

from .models import Customer, Enquiry, EnquiryStatus

logger = logging.getLogger("apps.enquiries")
DUPLICATE_WINDOW = timedelta(minutes=10)


def normalize_phone(raw: str) -> str:
    """'+91 98765-43210' → '+919876543210'. 7–15 digits (E.164 length), optional leading +."""
    raw = (raw or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not 7 <= len(digits) <= 15:
        raise exceptions.ValidationError({"phone": ["Enter a valid phone number (7–15 digits)."]})
    return ("+" if raw.startswith("+") else "") + digits


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
def _find_customer(business, phone: str, email: str):
    if phone:
        match = Customer.objects.select_for_update().filter(business=business, phone=phone).first()
        if match:
            return match
    if email:
        return Customer.objects.select_for_update().filter(business=business, email__iexact=email).first()
    return None


def match_or_create_customer(business, *, name: str, phone: str, email: str) -> Customer:
    """
    Reuse a customer by phone, then email; otherwise create one. Existing customers are never
    overwritten by public input (anyone can type any name) — only empty contact fields are filled.
    """
    customer = _find_customer(business, phone, email)
    if customer is None:
        try:
            with transaction.atomic():
                return Customer.objects.create(business=business, name=name, phone=phone, email=email.lower())
        except IntegrityError:  # created concurrently by another submission
            customer = _find_customer(business, phone, email)
            if customer is None:
                raise
    changed = []
    if not customer.email and email and not Customer.objects.filter(business=business, email__iexact=email).exists():
        customer.email = email.lower()
        changed.append("email")
    if not customer.phone and phone and not Customer.objects.filter(business=business, phone=phone).exists():
        customer.phone = phone
        changed.append("phone")
    if changed:
        customer.save(update_fields=[*changed, "updated_at"])
    return customer


def check_customer_uniqueness(business, *, phone: str, email: str, exclude_pk=None) -> None:
    qs = Customer.objects.filter(business=business)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    errors = {}
    if phone and qs.filter(phone=phone).exists():
        errors["phone"] = ["Another customer already has this phone number."]
    if email and qs.filter(email__iexact=email).exists():
        errors["email"] = ["Another customer already has this email address."]
    if errors:
        raise exceptions.ValidationError(errors)


# ---------------------------------------------------------------------------
# Enquiries
# ---------------------------------------------------------------------------
@transaction.atomic
def submit_public_enquiry(*, catalogue, product, name, phone, email, message, quantity, source, idempotency_key=""):
    """Returns (enquiry, created). Retries and accidental double submits return the original enquiry."""
    business = catalogue.business
    if idempotency_key:
        existing = Enquiry.objects.filter(business=business, idempotency_key=idempotency_key).first()
        if existing:
            return existing, False
    duplicate = Enquiry.objects.filter(
        business=business,
        phone=phone,
        message=message,
        product=product,
        catalogue=catalogue,
        created_at__gte=timezone.now() - DUPLICATE_WINDOW,
    ).first()
    if duplicate:
        return duplicate, False

    customer = match_or_create_customer(business, name=name, phone=phone, email=email)
    try:
        with transaction.atomic():
            enquiry = Enquiry.objects.create(
                business=business,
                customer=customer,
                catalogue=catalogue,
                product=product,
                name=name,
                phone=phone,
                email=email.lower(),
                message=message,
                quantity=quantity,
                product_name=product.name if product else "",
                catalogue_name=catalogue.name,
                source=source,
                idempotency_key=idempotency_key,
            )
    except IntegrityError:  # same idempotency key submitted concurrently
        return Enquiry.objects.get(business=business, idempotency_key=idempotency_key), False
    customer.last_enquiry_at = enquiry.created_at
    customer.save(update_fields=["last_enquiry_at", "updated_at"])
    audit.record("enquiry.received", business=business, actor_type=ActorType.PUBLIC, target=enquiry,
                 metadata={"source": source, "catalogue": catalogue.name, "product": enquiry.product_name})
    # In-app: everyone who may open enquiries. Name + product only — no phone, email or message.
    notify_members(
        business,
        "enquiry.view",
        event="enquiry.received",
        title="New enquiry received",
        body=f"{name} enquired about {enquiry.product_name}" if enquiry.product_name
        else f"{name} sent an enquiry from {catalogue.name}",
        link=f"/app/enquiries?enquiry={enquiry.id}",
        target=enquiry,
        dedup_key=f"enquiry:{enquiry.id}",
    )
    # Email stays exactly as before (one message to the business address).
    transaction.on_commit(lambda: notify_business(enquiry))
    # Never log personal data — ids only.
    logger.info("Enquiry received", extra={"enquiry_id": str(enquiry.id), "business_id": str(business.pk)})
    return enquiry, True


def notify_business(enquiry: Enquiry) -> None:
    """Email the business contact address about a new enquiry (in-app notifications are created separately)."""
    business = enquiry.business
    # Business-level switch (Settings → Catalogue): the in-app notifications are unaffected.
    if not business.email or not business.enquiry_email_enabled:
        return
    send_email(
        "enquiry.new",
        to=business.email,
        context={
            "business_name": business.name,
            "catalogue_name": enquiry.catalogue_name,
            "customer_name": enquiry.name,
            "customer_phone": enquiry.phone,
            "customer_email": enquiry.email,
            "product_name": enquiry.product_name,
            "quantity": enquiry.quantity,
            "message": enquiry.message,
            "panel_url": f"{settings.FRONTEND_URL}/app/enquiries?enquiry={enquiry.id}",
        },
    )


@transaction.atomic
def update_enquiry(enquiry: Enquiry, *, user=None, **data) -> Enquiry:
    status = data.pop("status", None)
    now = timezone.now()
    changes = {}
    if status and status != enquiry.status:
        changes["status"] = {"from": enquiry.status, "to": status}
        enquiry.status = status
        enquiry.status_changed_at = now
        if status == EnquiryStatus.CONVERTED and enquiry.converted_at is None:
            enquiry.converted_at = now
    if "internal_notes" in data and data["internal_notes"] != enquiry.internal_notes:
        changes["internal_notes"] = {}  # redacted by the audit service: only the fact is kept
    for field, value in data.items():
        setattr(enquiry, field, value)
    enquiry.save()
    if changes:
        action = "enquiry.status_changed" if "status" in changes else "enquiry.updated"
        audit.record(action, business=enquiry.business, actor=user, target=enquiry, changes=changes)
    return enquiry


@transaction.atomic
def bulk_set_status(enquiries, status: str, *, user=None) -> int:
    for enquiry in enquiries:
        update_enquiry(enquiry, status=status, user=user)
    return len(enquiries)


@transaction.atomic
def delete_enquiries(enquiries, *, user=None) -> int:
    for enquiry in enquiries:
        audit.record("enquiry.deleted", business=enquiry.business, actor=user, target=enquiry)
    return Enquiry.objects.filter(pk__in=[e.pk for e in enquiries]).delete()[0]
