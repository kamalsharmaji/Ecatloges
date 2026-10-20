from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.core.models import UUIDModel


class CategoryStatus(models.TextChoices):
    PUBLISHED = "published", "Published"
    DRAFT = "draft", "Draft"


# Icon keys offered by the category icon picker (rendered by the frontend icon set).
CATEGORY_ICONS = ("folder", "sofa", "lamp", "shirt", "monitor", "utensils", "bed", "trees", "headphones",
                  "shopping-bag", "dumbbell", "car", "gem", "package", "home", "sparkles")


class Category(UUIDModel):
    """
    Business-wide product categories (shared by all of the business's catalogues), with optional
    parent for subcategories (max depth 3). Names are unique per business, case-insensitively.
    `status` only controls whether the category is shown in public catalogue navigation.
    """

    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="categories")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.RESTRICT, related_name="children")
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=500, blank=True)
    icon = models.CharField(max_length=30, default="folder")
    image = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True, on_delete=models.RESTRICT, related_name="+"
    )
    status = models.CharField(max_length=20, choices=CategoryStatus.choices, default=CategoryStatus.PUBLISHED)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(Lower("name"), "business", name="products_category_name_ci_unique"),
            models.CheckConstraint(condition=~Q(parent=models.F("id")), name="products_category_not_own_parent"),
        ]
        indexes = [
            models.Index(fields=["business", "parent"], name="category_biz_parent"),
            models.Index(fields=["business", "status"], name="category_biz_status"),
        ]

    def __str__(self):
        return self.name

    def ancestors(self) -> list["Category"]:
        chain, node, seen = [], self.parent, set()
        while node is not None and node.pk not in seen:
            seen.add(node.pk)
            chain.append(node)
            node = node.parent
        return list(reversed(chain))


class ProductStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    ARCHIVED = "archived", "Archived"  # shown as "Inactive" in the UI design


class StockStatus(models.TextChoices):
    IN_STOCK = "in_stock", "In stock"
    OUT_OF_STOCK = "out_of_stock", "Out of stock"
    MADE_TO_ORDER = "made_to_order", "Made to order"


class Product(UUIDModel):
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.RESTRICT, related_name="products")
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=64, blank=True)
    short_description = models.CharField(max_length=300)
    description = models.TextField(max_length=5000, blank=True)

    # Price and MOQ are optional (many B2B sellers quote on request).
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    compare_at_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    currency = models.CharField(max_length=3, default="INR")
    show_price = models.BooleanField(default=True, help_text="Show the price on public catalogues.")
    moq = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    moq_unit = models.CharField(max_length=20, default="units")
    stock_status = models.CharField(max_length=20, choices=StockStatus.choices, default=StockStatus.IN_STOCK)

    tags = models.JSONField(default=list, blank=True)
    highlights = models.JSONField(default=list, blank=True)
    is_featured = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=ProductStatus.choices, default=ProductStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["position", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                Lower("sku"), "business", condition=~Q(sku=""), name="products_product_sku_ci_unique"
            ),
            models.CheckConstraint(condition=Q(price__isnull=True) | Q(price__gte=0), name="products_price_gte_0"),
            models.CheckConstraint(
                condition=Q(compare_at_price__isnull=True) | Q(compare_at_price__gte=0), name="products_compare_gte_0"
            ),
            models.CheckConstraint(condition=Q(moq__isnull=True) | Q(moq__gte=1), name="products_moq_gte_1"),
        ]
        indexes = [
            models.Index(fields=["business", "status"], name="product_biz_status"),
            models.Index(fields=["business", "category"], name="product_biz_category"),
            models.Index(fields=["business", "-created_at"], name="product_biz_created"),
        ]

    def __str__(self):
        return self.name


class ProductMedia(models.Model):
    """Ordered images/videos of a product. Position 0 is the main image."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="media_items")
    asset = models.ForeignKey("media_library.MediaAsset", on_delete=models.RESTRICT, related_name="product_uses")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["product", "asset"], name="products_media_unique")]
