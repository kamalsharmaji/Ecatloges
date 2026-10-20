"""Invoice issuing (gapless numbering, immutable snapshots) and PDF rendering."""
from decimal import Decimal
from io import BytesIO

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import BillingInterval, Invoice, InvoiceLine, InvoiceSequence

TEST_SERIES = "TEST"


def _next_number(series: str, year: int) -> str:
    try:
        with transaction.atomic():
            InvoiceSequence.objects.get_or_create(series=series, year=year)
    except IntegrityError:  # created concurrently — fine, it exists now
        pass
    seq = InvoiceSequence.objects.select_for_update().get(series=series, year=year)
    seq.last_number += 1
    seq.save(update_fields=["last_number"])
    return f"{series}-{year}-{seq.last_number:06d}"


def _buyer_snapshot(business) -> dict:
    address = ", ".join(
        p for p in [business.address_line1, business.address_line2, business.city, business.state,
                    business.postal_code, business.country] if p
    )
    return {
        "name": business.name,
        "contact": business.owner_name,
        "email": business.email,
        "phone": business.phone,
        "address": address,
    }


def _seller_snapshot() -> dict:
    return {
        "name": settings.BILLING_SELLER_NAME,
        "address": settings.BILLING_SELLER_ADDRESS,
        "email": settings.BILLING_SELLER_EMAIL,
        "tax_id": settings.BILLING_SELLER_TAX_ID,
    }


@transaction.atomic
def issue_invoice(payment) -> Invoice:
    """Create the paid invoice for an applied payment (idempotent)."""
    existing = Invoice.objects.filter(payment=payment).first()
    if existing:
        return existing
    now = timezone.now()
    series = TEST_SERIES if payment.is_test else settings.BILLING_INVOICE_PREFIX
    subscription = payment.subscription
    interval = BillingInterval(subscription.plan_interval).label
    period = ""
    if payment.period_start and payment.period_end:
        period = f" ({payment.period_start:%d %b %Y} – {payment.period_end:%d %b %Y})"
    invoice = Invoice.objects.create(
        business=payment.business,
        subscription=subscription,
        payment=payment,
        number=_next_number(series, now.year),
        issued_at=now,
        period_start=payment.period_start,
        period_end=payment.period_end,
        currency=payment.currency,
        subtotal=payment.subtotal,
        discount_amount=payment.discount_amount,
        tax_name=payment.tax_name,
        tax_rate=payment.tax_rate,
        tax_inclusive=payment.tax_inclusive,
        tax_amount=payment.tax_amount,
        total=payment.amount,
        is_test=payment.is_test,
        seller=_seller_snapshot(),
        buyer=_buyer_snapshot(payment.business),
    )
    InvoiceLine.objects.create(
        invoice=invoice,
        description=f"{subscription.plan_name} — {interval} subscription{period}",
        plan_code=subscription.plan_code,
        quantity=1,
        unit_price=payment.subtotal + payment.discount_amount,
        amount=payment.subtotal + payment.discount_amount,
    )
    return invoice


def _money(value: Decimal, currency: str) -> str:
    return f"{currency} {value:,.2f}"


def render_invoice_pdf(invoice: Invoice) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(f"Invoice {invoice.number}")
    width, height = A4
    left, right = 20 * mm, width - 20 * mm
    y = height - 25 * mm

    pdf.setFillColor(colors.HexColor("#1d4ed8"))
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(left, y, "INVOICE")
    pdf.setFillColor(colors.black)
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(right, y, invoice.number)
    y -= 6 * mm
    pdf.drawRightString(right, y, f"Issued {invoice.issued_at:%d %b %Y}")
    y -= 5 * mm
    pdf.drawRightString(right, y, f"Status: {invoice.get_status_display()}")
    if invoice.is_test:
        pdf.setFillColor(colors.HexColor("#b91c1c"))
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(left, y, "TEST MODE — no real payment was made")
        pdf.setFillColor(colors.black)

    def party(title, data, x, top):
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(x, top, title)
        pdf.setFont("Helvetica", 9)
        line = top
        for key in ("name", "contact", "address", "email", "phone", "tax_id"):
            if data.get(key):
                line -= 4.5 * mm
                text = f"Tax ID: {data[key]}" if key == "tax_id" else str(data[key])
                pdf.drawString(x, line, text[:70])
        return line

    y -= 12 * mm
    bottom = min(party("From", invoice.seller, left, y), party("Bill to", invoice.buyer, width / 2, y))
    y = bottom - 12 * mm

    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(left, y, "Description")
    pdf.drawRightString(right - 35 * mm, y, "Qty")
    pdf.drawRightString(right, y, "Amount")
    y -= 2 * mm
    pdf.line(left, y, right, y)
    pdf.setFont("Helvetica", 9)
    for line in invoice.lines.all():
        y -= 6 * mm
        pdf.drawString(left, y, line.description[:85])
        pdf.drawRightString(right - 35 * mm, y, str(line.quantity))
        pdf.drawRightString(right, y, _money(line.amount, invoice.currency))
    y -= 4 * mm
    pdf.line(left, y, right, y)

    rows = [("Subtotal", invoice.subtotal)]
    if invoice.discount_amount:
        rows.append(("Discount", -invoice.discount_amount))
    if invoice.tax_rate:
        label = f"{invoice.tax_name or 'Tax'} {invoice.tax_rate}%{' (included)' if invoice.tax_inclusive else ''}"
        rows.append((label, invoice.tax_amount))
    else:
        rows.append(("Tax (not configured)", Decimal("0.00")))
    for label, value in rows:
        y -= 6 * mm
        pdf.drawRightString(right - 35 * mm, y, label)
        pdf.drawRightString(right, y, _money(value, invoice.currency))
    y -= 8 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(right - 35 * mm, y, "Total paid")
    pdf.drawRightString(right, y, _money(invoice.total, invoice.currency))

    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(colors.grey)
    pdf.drawString(left, 15 * mm, f"Payment reference: {invoice.payment.provider_order_id}")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
