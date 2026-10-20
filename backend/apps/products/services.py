"""
Category and product rules. Every mutation that creates or exposes content requires paid access;
deleting, archiving and unpublishing are always allowed (so customers can get back under limits).
"""
import logging
import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import exceptions

from apps.audit_logs import services as audit
from apps.billing import entitlements
from apps.core.exceptions import BusinessRuleViolation

from .models import Category, Product, ProductMedia, ProductStatus

logger = logging.getLogger("apps.products")
MAX_CATEGORY_DEPTH = 3


CATEGORY_AUDIT_FIELDS = ("name", "description", "icon", "parent", "image", "status", "sort_order")
PRODUCT_AUDIT_FIELDS = (
    "name", "sku", "category", "price", "compare_at_price", "show_price", "moq", "moq_unit", "stock_status",
    "is_featured", "status", "short_description", "description",
)
PRODUCT_STATUS_ACTIONS = {
    ProductStatus.PUBLISHED: "product.published",
    ProductStatus.DRAFT: "product.unpublished",
    ProductStatus.ARCHIVED: "product.archived",
}


def active_product_count(business) -> int:
    """Usage counter for `max_products`: archived products don't count."""
    return Product.objects.filter(business=business).exclude(status=ProductStatus.ARCHIVED).count()


def _rule(message, code):
    return BusinessRuleViolation(message, code=code)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
def _validate_parent(category: Category | None, parent: Category | None) -> None:
    if parent is None:
        return
    chain = [*parent.ancestors(), parent]
    if category is not None and any(node.pk == category.pk for node in chain):
        raise exceptions.ValidationError({"parent_id": ["A category cannot be placed inside itself."]})
    depth_below = _subtree_depth(category) if category is not None else 0
    if len(chain) + 1 + depth_below > MAX_CATEGORY_DEPTH:
        raise exceptions.ValidationError({"parent_id": [f"Categories can be nested at most {MAX_CATEGORY_DEPTH} levels deep."]})


def _subtree_depth(category: Category) -> int:
    depth, level = 0, [category.pk]
    while level:
        level = list(Category.objects.filter(parent_id__in=level).values_list("pk", flat=True))
        if level:
            depth += 1
    return depth


def _name_taken(business, name, exclude_pk=None) -> bool:
    qs = Category.objects.filter(business=business, name__iexact=name.strip())
    return qs.exclude(pk=exclude_pk).exists() if exclude_pk else qs.exists()


@transaction.atomic
def save_category(ctx, *, instance: Category | None = None, **data) -> Category:
    entitlements.require_paid_access(ctx.business)
    if "name" in data and _name_taken(ctx.business, data["name"], instance.pk if instance else None):
        raise exceptions.ValidationError({"name": ["A category with this name already exists."]})
    if "parent" in data:
        _validate_parent(instance, data["parent"])
    category = instance or Category(business=ctx.business)
    before = audit.snapshot(category, CATEGORY_AUDIT_FIELDS) if instance else {}
    for field, value in data.items():
        setattr(category, field, value)
    try:
        with transaction.atomic():
            category.save()
    except IntegrityError:
        raise exceptions.ValidationError({"name": ["A category with this name already exists."]}) from None
    if instance is None:
        audit.record_ctx(ctx, "category.created", target=category)
    elif changes := audit.diff(before, audit.snapshot(category, CATEGORY_AUDIT_FIELDS)):
        audit.record_ctx(ctx, "category.updated", target=category, changes=changes)
    return category


@transaction.atomic
def delete_category(ctx, category: Category, *, reassign_to: Category | None = None) -> int:
    """Products are never silently orphaned: they must be moved to another category first."""
    category = Category.objects.select_for_update().get(pk=category.pk)
    if category.children.exists():
        raise _rule("Move or delete the subcategories first.", "category_has_children")
    count = category.products.count()
    if count and reassign_to is None:
        raise _rule(
            f"{count} product{'s use' if count != 1 else ' uses'} this category. Choose a category to move "
            f"{'them' if count != 1 else 'it'} to.",
            "category_in_use",
        )
    if reassign_to is not None:
        if reassign_to.pk == category.pk:
            raise exceptions.ValidationError({"reassign_to": ["Choose a different category."]})
        Product.objects.filter(category=category).update(category=reassign_to, updated_at=timezone.now())
    audit.record_ctx(ctx, "category.deleted", target=category,
                     metadata={"products_moved": count, "moved_to": reassign_to.name if reassign_to else ""})
    category.delete()
    return count


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
def _set_media(product: Product, assets: list) -> None:
    if len(assets) > settings.MEDIA_MAX_ITEMS_PER_PRODUCT:
        raise exceptions.ValidationError(
            {"media_ids": [f"A product can have at most {settings.MEDIA_MAX_ITEMS_PER_PRODUCT} images and videos."]}
        )
    if len({a.pk for a in assets}) != len(assets):
        raise exceptions.ValidationError({"media_ids": ["Each file can only be added once."]})
    ProductMedia.objects.filter(product=product).delete()
    ProductMedia.objects.bulk_create(
        [ProductMedia(product=product, asset=asset, position=i) for i, asset in enumerate(assets)]
    )


def _set_catalogues(product: Product, catalogues: list) -> None:
    from apps.catalogues.models import CatalogueItem

    wanted = {c.pk for c in catalogues}
    CatalogueItem.objects.filter(product=product).exclude(catalogue_id__in=wanted).delete()
    existing = set(CatalogueItem.objects.filter(product=product).values_list("catalogue_id", flat=True))
    for catalogue in catalogues:
        if catalogue.pk in existing:
            continue
        last = CatalogueItem.objects.filter(catalogue=catalogue).aggregate(m=Max("position"))["m"]
        CatalogueItem.objects.create(catalogue=catalogue, product=product, position=(last or 0) + 1 if last is not None else 0)


def _apply_status(product: Product, status: str) -> None:
    if status == ProductStatus.PUBLISHED and product.status != ProductStatus.PUBLISHED:
        product.published_at = timezone.now()
    product.status = status


@transaction.atomic
def create_product(ctx, *, user, media=None, catalogues=None, **data) -> Product:
    entitlements.lock_business(ctx.business)
    status = data.pop("status", ProductStatus.DRAFT)
    if status != ProductStatus.ARCHIVED:
        entitlements.assert_within_limit(ctx.business, "max_products")
    else:
        entitlements.require_paid_access(ctx.business)
    product = Product(business=ctx.business, created_by=user, **data)
    _apply_status(product, status)
    _save_with_sku_check(product)
    if media is not None:
        _set_media(product, media)
    if catalogues is not None:
        _set_catalogues(product, catalogues)
    audit.record_ctx(ctx, "product.created", target=product, metadata={"status": status})
    logger.info("Product created", extra={"product_id": str(product.pk), "business_id": str(ctx.business.pk)})
    return product


@transaction.atomic
def update_product(ctx, product: Product, *, media=None, catalogues=None, **data) -> Product:
    entitlements.lock_business(ctx.business)
    product = Product.objects.select_for_update().get(pk=product.pk)
    before = audit.snapshot(product, PRODUCT_AUDIT_FIELDS)
    status = data.pop("status", None)
    if status is not None and product.status == ProductStatus.ARCHIVED and status != ProductStatus.ARCHIVED:
        entitlements.assert_within_limit(ctx.business, "max_products")  # restoring takes a slot again
    elif status != ProductStatus.ARCHIVED:
        entitlements.require_paid_access(ctx.business)
    for field, value in data.items():
        setattr(product, field, value)
    if status is not None:
        _apply_status(product, status)
    _save_with_sku_check(product)
    if media is not None:
        _set_media(product, media)
    if catalogues is not None:
        _set_catalogues(product, catalogues)
    changes = audit.diff(before, audit.snapshot(product, PRODUCT_AUDIT_FIELDS))
    if media is not None:
        changes["media"] = {"from": None, "to": len(media)}
    if catalogues is not None:
        changes["catalogues"] = {"from": None, "to": [c.name for c in catalogues]}
    if changes:
        status_change = changes.get("status")
        action = PRODUCT_STATUS_ACTIONS.get(status_change["to"], "product.updated") if status_change else "product.updated"
        if status_change and status_change["from"] == ProductStatus.ARCHIVED:
            action = "product.restored"
        audit.record_ctx(ctx, action, target=product, changes=changes)
    return product


@transaction.atomic
def delete_product(ctx, product: Product) -> None:
    audit.record_ctx(ctx, "product.deleted", target=product)
    product.delete()


def _save_with_sku_check(product: Product) -> None:
    if product.sku:
        clash = Product.objects.filter(business=product.business, sku__iexact=product.sku).exclude(pk=product.pk)
        if clash.exists():
            raise exceptions.ValidationError({"sku": ["Another product already uses this SKU."]})
    try:
        with transaction.atomic():
            product.save()
    except IntegrityError:
        raise exceptions.ValidationError({"sku": ["Another product already uses this SKU."]}) from None


def set_status(ctx, product: Product, status: str) -> Product:
    return update_product(ctx, product, status=status)


@transaction.atomic
def duplicate_product(ctx, product: Product, *, user) -> Product:
    entitlements.lock_business(ctx.business)
    entitlements.assert_within_limit(ctx.business, "max_products")
    copy = Product.objects.get(pk=product.pk)
    copy.pk = uuid.uuid4()  # UUID primary keys are not regenerated automatically
    copy._state.adding = True
    copy.name = f"{product.name} (copy)"[:200]
    copy.sku = ""
    copy.status = ProductStatus.DRAFT
    copy.published_at = None
    copy.is_featured = False
    copy.created_by = user
    copy.save()
    ProductMedia.objects.bulk_create(
        [ProductMedia(product=copy, asset_id=m.asset_id, position=m.position) for m in product.media_items.all()]
    )
    audit.record_ctx(ctx, "product.duplicated", target=copy, metadata={"source": product.name})
    return copy


BULK_PERMISSIONS = {
    "publish": ("product.publish",),
    "unpublish": ("product.publish",),
    "archive": ("product.update",),
    "restore": ("product.update",),
    "delete": ("product.delete",),
    "add_to_catalogue": ("product.update", "catalogue.update"),
    "remove_from_catalogue": ("product.update", "catalogue.update"),
}


@transaction.atomic
def bulk_action(ctx, *, products: list[Product], action: str, catalogue=None) -> int:
    from apps.catalogues.models import CatalogueItem

    if not ctx.has(*BULK_PERMISSIONS[action]):
        raise exceptions.PermissionDenied("You do not have permission to perform this action.")
    if action in ("add_to_catalogue", "remove_from_catalogue") and catalogue is None:
        raise exceptions.ValidationError({"catalogue_id": ["Choose a catalogue."]})
    entitlements.lock_business(ctx.business)
    ids = [p.pk for p in products]
    qs = Product.objects.filter(business=ctx.business, pk__in=ids)

    if action in ("publish", "restore", "add_to_catalogue"):
        entitlements.require_paid_access(ctx.business)
    if action in ("publish", "restore"):
        reviving = qs.filter(status=ProductStatus.ARCHIVED).count()
        if reviving:
            entitlements.assert_within_limit(ctx.business, "max_products", adding=reviving)

    now = timezone.now()
    if action == "publish":
        qs.exclude(status=ProductStatus.PUBLISHED).update(status=ProductStatus.PUBLISHED, published_at=now, updated_at=now)
    elif action == "unpublish":
        qs.filter(status=ProductStatus.PUBLISHED).update(status=ProductStatus.DRAFT, updated_at=now)
    elif action == "archive":
        qs.update(status=ProductStatus.ARCHIVED, updated_at=now)
    elif action == "restore":
        qs.filter(status=ProductStatus.ARCHIVED).update(status=ProductStatus.DRAFT, updated_at=now)
    elif action == "delete":
        qs.delete()
    elif action == "add_to_catalogue":
        last = CatalogueItem.objects.filter(catalogue=catalogue).aggregate(m=Max("position"))["m"] or 0
        existing = set(CatalogueItem.objects.filter(catalogue=catalogue, product_id__in=ids).values_list("product_id", flat=True))
        CatalogueItem.objects.bulk_create(
            [
                CatalogueItem(catalogue=catalogue, product_id=pid, position=last + i + 1)
                for i, pid in enumerate(p for p in ids if p not in existing)
            ]
        )
    elif action == "remove_from_catalogue":
        CatalogueItem.objects.filter(catalogue=catalogue, product_id__in=ids).delete()
    audit.record_ctx(
        ctx, f"product.bulk_{action}", target_type="product", target_label=f"{len(ids)} products",
        metadata={"count": len(ids), "names": [p.name for p in products][:20], "catalogue": catalogue.name if catalogue else ""},
    )
    logger.info("Bulk product action", extra={"action": action, "count": len(ids), "business_id": str(ctx.business.pk)})
    return len(ids)
