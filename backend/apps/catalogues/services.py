import logging

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import exceptions

from apps.audit_logs import services as audit
from apps.billing import entitlements
from apps.notifications.models import NotificationLevel
from apps.notifications.services import notify_members

from .models import Catalogue, CatalogueItem, CatalogueStatus

logger = logging.getLogger("apps.catalogues")

AUDIT_FIELDS = (
    "name", "slug", "tagline", "description", "theme_color", "show_prices", "enquiries_enabled",
    "whatsapp_number", "contact_email", "cover", "logo", "status",
)
STATUS_ACTIONS = {
    (CatalogueStatus.PUBLISHED, None): "catalogue.published",
    (CatalogueStatus.DRAFT, CatalogueStatus.PUBLISHED): "catalogue.unpublished",
    (CatalogueStatus.ARCHIVED, None): "catalogue.archived",
    (CatalogueStatus.DRAFT, CatalogueStatus.ARCHIVED): "catalogue.restored",
}


def _status_action(old: str, new: str) -> str:
    return STATUS_ACTIONS.get((new, old)) or STATUS_ACTIONS.get((new, None)) or "catalogue.updated"


def active_catalogue_count(business) -> int:
    """Usage counter for `max_catalogues`: archived catalogues don't count."""
    return Catalogue.objects.filter(business=business).exclude(status=CatalogueStatus.ARCHIVED).count()


def _unique_slug(business, base: str, exclude_pk=None) -> str:
    base = (slugify(base) or "catalogue")[:70]
    slug, n = base, 2
    qs = Catalogue.objects.filter(business=business)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _apply_status(catalogue: Catalogue, status: str) -> None:
    now = timezone.now()
    if status == CatalogueStatus.PUBLISHED and catalogue.status != CatalogueStatus.PUBLISHED:
        catalogue.published_at = now
    if status == CatalogueStatus.ARCHIVED and catalogue.status != CatalogueStatus.ARCHIVED:
        catalogue.archived_at = now
    if status != CatalogueStatus.ARCHIVED:
        catalogue.archived_at = None
    catalogue.status = status


def _save(catalogue: Catalogue) -> None:
    try:
        with transaction.atomic():
            catalogue.save()
    except IntegrityError:
        raise exceptions.ValidationError({"slug": ["Another catalogue already uses this link."]}) from None


@transaction.atomic
def create_catalogue(ctx, *, user, **data) -> Catalogue:
    entitlements.lock_business(ctx.business)
    status = data.pop("status", CatalogueStatus.DRAFT)
    entitlements.assert_within_limit(ctx.business, "max_catalogues")
    explicit = slugify(data.pop("slug", "") or "")[:80]
    if explicit and Catalogue.objects.filter(business=ctx.business, slug=explicit).exists():
        # A link the owner typed must be exactly what they asked for.
        raise exceptions.ValidationError({"slug": ["Another catalogue already uses this link."]})
    slug = explicit or _unique_slug(ctx.business, data["name"])
    # Business-wide defaults (Settings → Catalogue) fill whatever the client didn't send.
    business = ctx.business
    data.setdefault("theme_color", business.brand_color)
    data.setdefault("show_prices", business.default_show_prices)
    data.setdefault("enquiries_enabled", business.default_enquiries_enabled)
    data.setdefault("whatsapp_number", business.default_whatsapp_number)
    catalogue = Catalogue(business=ctx.business, created_by=user, slug=slug, **data)
    _apply_status(catalogue, status)
    _save(catalogue)
    audit.record_ctx(ctx, "catalogue.created", target=catalogue, metadata={"status": status})
    logger.info("Catalogue created", extra={"catalogue_id": str(catalogue.pk), "business_id": str(ctx.business.pk)})
    return catalogue


@transaction.atomic
def update_catalogue(ctx, catalogue: Catalogue, **data) -> Catalogue:
    entitlements.lock_business(ctx.business)
    catalogue = Catalogue.objects.select_for_update().get(pk=catalogue.pk)
    before = audit.snapshot(catalogue, AUDIT_FIELDS)
    status = data.pop("status", None)
    reviving = status is not None and catalogue.status == CatalogueStatus.ARCHIVED and status != CatalogueStatus.ARCHIVED
    if reviving:
        entitlements.assert_within_limit(ctx.business, "max_catalogues")
    elif status not in (CatalogueStatus.ARCHIVED, CatalogueStatus.DRAFT) or data:
        entitlements.require_paid_access(ctx.business)
    if "slug" in data:
        slug = slugify(data.pop("slug"))[:80]
        if not slug:
            raise exceptions.ValidationError({"slug": ["Enter a link name using letters, numbers or dashes."]})
        if Catalogue.objects.filter(business=ctx.business, slug=slug).exclude(pk=catalogue.pk).exists():
            raise exceptions.ValidationError({"slug": ["Another catalogue already uses this link."]})
        catalogue.slug = slug
    for field, value in data.items():
        setattr(catalogue, field, value)
    if status is not None:
        _apply_status(catalogue, status)
    _save(catalogue)
    changes = audit.diff(before, audit.snapshot(catalogue, AUDIT_FIELDS))
    if changes:
        status_change = changes.get("status")
        action = _status_action(status_change["from"], status_change["to"]) if status_change else "catalogue.updated"
        audit.record_ctx(ctx, action, target=catalogue, changes=changes)
        if action == "catalogue.published":
            notify_members(
                ctx.business,
                "catalogue.view",
                exclude=ctx.membership.user,
                event="catalogue.published",
                level=NotificationLevel.SUCCESS,
                title="Catalogue published",
                body=f"“{catalogue.name}” is now live.",
                link=f"/app/catalogues/{catalogue.pk}",
                target=catalogue,
            )
    return catalogue


@transaction.atomic
def delete_catalogue(ctx, catalogue: Catalogue) -> None:
    audit.record_ctx(ctx, "catalogue.deleted", target=catalogue)
    catalogue.delete()


@transaction.atomic
def add_products(ctx, catalogue: Catalogue, products: list) -> int:
    entitlements.require_paid_access(ctx.business)
    existing = set(catalogue.items.values_list("product_id", flat=True))
    last = catalogue.items.aggregate(m=Max("position"))["m"]
    start = -1 if last is None else last
    new = [p for p in products if p.pk not in existing]
    CatalogueItem.objects.bulk_create(
        [CatalogueItem(catalogue=catalogue, product=p, position=start + i + 1) for i, p in enumerate(new)]
    )
    if new:
        audit.record_ctx(ctx, "catalogue.products_added", target=catalogue, metadata={"count": len(new)})
    return len(new)


@transaction.atomic
def remove_products(catalogue: Catalogue, product_ids: list, *, ctx=None) -> int:
    deleted, _ = catalogue.items.filter(product_id__in=product_ids).delete()
    if deleted and ctx is not None:
        audit.record_ctx(ctx, "catalogue.products_removed", target=catalogue, metadata={"count": deleted})
    return deleted


@transaction.atomic
def reorder(catalogue: Catalogue, product_ids: list) -> None:
    """Products listed first keep the given order; any others keep their relative order after them."""
    items = {item.product_id: item for item in catalogue.items.select_for_update()}
    ordered = [pid for pid in product_ids if pid in items]
    rest = [item.product_id for item in sorted(items.values(), key=lambda i: (i.position, i.pk)) if item.product_id not in set(ordered)]
    updates = []
    for position, pid in enumerate([*ordered, *rest]):
        item = items[pid]
        if item.position != position:
            item.position = position
            updates.append(item)
    CatalogueItem.objects.bulk_update(updates, ["position"])
