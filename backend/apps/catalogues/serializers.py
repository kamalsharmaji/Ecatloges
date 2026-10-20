from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.businesses.fields import BusinessScopedPrimaryKeyField
from apps.media_library.models import MediaAsset
from apps.media_library.serializers import MediaBriefSerializer
from apps.products.models import Product
from apps.products.serializers import CategoryBriefSerializer

from .models import Catalogue, CatalogueStatus


class CatalogueSerializer(serializers.ModelSerializer):
    cover_id = BusinessScopedPrimaryKeyField(
        model=MediaAsset, scope_filter={"kind": "image"}, source="cover", allow_null=True, required=False
    )
    logo_id = BusinessScopedPrimaryKeyField(
        model=MediaAsset, scope_filter={"kind": "image"}, source="logo", allow_null=True, required=False
    )
    cover = MediaBriefSerializer(read_only=True)
    logo = MediaBriefSerializer(read_only=True)
    slug = serializers.CharField(max_length=80, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=CatalogueStatus.choices, required=False)
    product_count = serializers.IntegerField(read_only=True, default=0)
    published_product_count = serializers.IntegerField(read_only=True, default=0)
    view_count = serializers.IntegerField(read_only=True, default=0)
    enquiry_count = serializers.IntegerField(read_only=True, default=0)
    public_url = serializers.CharField(read_only=True)

    class Meta:
        model = Catalogue
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "tagline",
            "cover_id",
            "cover",
            "logo_id",
            "logo",
            "theme_color",
            "show_prices",
            "whatsapp_number",
            "contact_email",
            "enquiries_enabled",
            "status",
            "public_url",
            "product_count",
            "published_product_count",
            "view_count",
            "enquiry_count",
            "published_at",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "published_at", "archived_at", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a catalogue name.")
        return value


class CatalogueSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    published = serializers.IntegerField()
    draft = serializers.IntegerField()
    archived = serializers.IntegerField()
    limit = serializers.IntegerField(allow_null=True)


class CatalogueItemSerializer(serializers.Serializer):
    """A product inside a catalogue, in catalogue order."""

    product_id = serializers.UUIDField(source="product.id")
    position = serializers.IntegerField()
    name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    status = serializers.CharField(source="product.status")
    price = serializers.DecimalField(source="product.price", max_digits=12, decimal_places=2, allow_null=True)
    currency = serializers.CharField(source="product.currency")
    category = CategoryBriefSerializer(source="product.category")
    thumbnail = serializers.SerializerMethodField()

    @extend_schema_field(MediaBriefSerializer(allow_null=True))
    def get_thumbnail(self, item):
        media = list(item.product.media_items.all())
        return MediaBriefSerializer(media[0].asset).data if media else None


class ProductIdsSerializer(serializers.Serializer):
    product_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=500)


# ---------------------------------------------------------------------------
# Public (anonymous) serializers — only what a visitor should see.
# ---------------------------------------------------------------------------
class PublicBusinessSerializer(serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()
    city = serializers.CharField()
    state = serializers.CharField()
    description = serializers.CharField()
    website = serializers.CharField()
    # Settings → Business profile / Branding. Validated https links on known networks only.
    social_links = serializers.DictField(child=serializers.CharField())
    logo = MediaBriefSerializer(allow_null=True)


class PublicCategorySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    icon = serializers.CharField()
    product_count = serializers.IntegerField()
    image = MediaBriefSerializer(allow_null=True)


class PublicCatalogueSerializer(serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField()
    tagline = serializers.CharField()
    theme_color = serializers.CharField()
    show_prices = serializers.BooleanField()
    whatsapp_number = serializers.CharField()
    contact_email = serializers.CharField()
    enquiries_enabled = serializers.BooleanField()
    cover = MediaBriefSerializer(allow_null=True)
    logo = MediaBriefSerializer(allow_null=True)
    public_url = serializers.CharField()
    business = PublicBusinessSerializer()
    categories = PublicCategorySerializer(many=True)
    product_count = serializers.IntegerField()


class PublicProductSerializer(serializers.ModelSerializer):
    """Prices are hidden when the catalogue or the product says so."""

    category = CategoryBriefSerializer(read_only=True)
    price = serializers.SerializerMethodField()
    compare_at_price = serializers.SerializerMethodField()
    media = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "short_description",
            "category",
            "price",
            "compare_at_price",
            "currency",
            "moq",
            "moq_unit",
            "stock_status",
            "is_featured",
            "media",
        ]

    def _show_price(self, obj) -> bool:
        return obj.show_price and self.context.get("catalogue_shows_prices", True)

    def get_price(self, obj) -> str | None:
        return str(obj.price) if obj.price is not None and self._show_price(obj) else None

    def get_compare_at_price(self, obj) -> str | None:
        return str(obj.compare_at_price) if obj.compare_at_price is not None and self._show_price(obj) else None

    @extend_schema_field(MediaBriefSerializer(many=True))
    def get_media(self, obj):
        return MediaBriefSerializer([m.asset for m in obj.media_items.all()], many=True).data


class PublicProductDetailSerializer(PublicProductSerializer):
    class Meta(PublicProductSerializer.Meta):
        fields = [*PublicProductSerializer.Meta.fields, "description", "tags", "highlights"]


__all__ = [
    "CatalogueSerializer",
    "CatalogueSummarySerializer",
    "CatalogueItemSerializer",
    "ProductIdsSerializer",
    "PublicCatalogueSerializer",
    "PublicProductSerializer",
    "PublicProductDetailSerializer",
]
