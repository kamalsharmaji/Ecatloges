from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.businesses.fields import BusinessScopedPrimaryKeyField
from apps.media_library.models import MediaAsset
from apps.media_library.serializers import MediaBriefSerializer

from .models import CATEGORY_ICONS, Category, Product


class CategoryBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "icon"]


class CategorySerializer(serializers.ModelSerializer):
    parent_id = BusinessScopedPrimaryKeyField(
        model=Category, source="parent", allow_null=True, required=False
    )
    parent = CategoryBriefSerializer(read_only=True)
    image_id = BusinessScopedPrimaryKeyField(
        model=MediaAsset, scope_filter={"kind": "image"}, source="image", allow_null=True, required=False
    )
    image = MediaBriefSerializer(read_only=True)
    icon = serializers.ChoiceField(choices=CATEGORY_ICONS, default="folder")
    path = serializers.SerializerMethodField()
    product_count = serializers.IntegerField(read_only=True, default=0)
    children_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "description",
            "icon",
            "image_id",
            "image",
            "parent_id",
            "parent",
            "path",
            "status",
            "sort_order",
            "product_count",
            "children_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_path(self, obj) -> list[str]:
        return [a.name for a in obj.ancestors()] + [obj.name]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a category name.")
        return value


class CatalogueRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    cover_thumbnail_url = serializers.CharField(allow_null=True)


def _catalogue_refs(product) -> list[dict]:
    serializer = MediaBriefSerializer()
    refs = []
    for item in product.catalogue_items.all():
        c = item.catalogue
        refs.append(
            {
                "id": c.id,
                "name": c.name,
                "status": c.status,
                "cover_thumbnail_url": serializer.get_thumbnail_url(c.cover) if c.cover else None,
            }
        )
    return refs


class ProductListSerializer(serializers.ModelSerializer):
    category = CategoryBriefSerializer(read_only=True)
    thumbnail = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()
    catalogues = serializers.SerializerMethodField()
    view_count = serializers.IntegerField(read_only=True, default=0)
    enquiry_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Product
        fields = [
            "view_count",
            "enquiry_count",
            "id",
            "name",
            "sku",
            "short_description",
            "category",
            "price",
            "compare_at_price",
            "currency",
            "show_price",
            "moq",
            "moq_unit",
            "stock_status",
            "is_featured",
            "status",
            "thumbnail",
            "media_count",
            "catalogues",
            "published_at",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(MediaBriefSerializer(allow_null=True))
    def get_thumbnail(self, obj):
        items = list(obj.media_items.all())
        return MediaBriefSerializer(items[0].asset).data if items else None

    def get_media_count(self, obj) -> int:
        return len(obj.media_items.all())

    @extend_schema_field(CatalogueRefSerializer(many=True))
    def get_catalogues(self, obj):
        return CatalogueRefSerializer(_catalogue_refs(obj), many=True).data


def _clean_strings(values, *, max_items: int, max_len: int, label: str) -> list[str]:
    if not isinstance(values, list):
        raise serializers.ValidationError("Must be a list.")
    out, seen = [], set()
    for raw in values:
        text = str(raw).strip()
        if not text:
            continue
        if len(text) > max_len:
            raise serializers.ValidationError(f"Each {label} can be at most {max_len} characters.")
        if text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
    if len(out) > max_items:
        raise serializers.ValidationError(f"At most {max_items} {label}s.")
    return out


class ProductSerializer(ProductListSerializer):
    """Detail + write serializer. Media and catalogue ids are validated against the caller's business."""

    category_id = BusinessScopedPrimaryKeyField(model=Category, source="category")
    media_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, max_length=100
    )
    catalogue_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, max_length=100
    )
    media = serializers.SerializerMethodField()
    tags = serializers.ListField(child=serializers.CharField(allow_blank=True), required=False)
    highlights = serializers.ListField(child=serializers.CharField(allow_blank=True), required=False)

    class Meta(ProductListSerializer.Meta):
        fields = [
            *ProductListSerializer.Meta.fields,
            "category_id",
            "description",
            "tags",
            "highlights",
            "media",
            "media_ids",
            "catalogue_ids",
        ]
        read_only_fields = ["id", "published_at", "created_at", "updated_at"]

    @extend_schema_field(MediaBriefSerializer(many=True))
    def get_media(self, obj):
        return MediaBriefSerializer([m.asset for m in obj.media_items.all()], many=True).data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a product name.")
        return value

    def validate_short_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a short description.")
        return value

    def validate_sku(self, value):
        return value.strip()

    def validate_currency(self, value):
        value = value.strip().upper()
        if value not in settings.BILLING_CURRENCIES:
            raise serializers.ValidationError(f"Supported currencies: {', '.join(settings.BILLING_CURRENCIES)}.")
        return value

    def validate_tags(self, value):
        return _clean_strings(value, max_items=20, max_len=30, label="tag")

    def validate_highlights(self, value):
        return _clean_strings(value, max_items=10, max_len=120, label="highlight")

    def _resolve(self, model, ids, field, **extra):
        business = self.context["business"]
        found = {obj.pk: obj for obj in model.objects.filter(business=business, pk__in=ids, **extra)}
        missing = [str(i) for i in ids if i not in found]
        if missing:
            raise serializers.ValidationError({field: [f"Invalid id: {missing[0]}"]})
        return [found[i] for i in ids]

    def validate(self, attrs):
        from apps.catalogues.models import Catalogue

        price = attrs.get("price", getattr(self.instance, "price", None))
        compare = attrs.get("compare_at_price", getattr(self.instance, "compare_at_price", None))
        if price is not None and compare is not None and compare < price:
            raise serializers.ValidationError({"compare_at_price": ["Compare price must be at least the price."]})
        if "media_ids" in attrs:
            attrs["media"] = self._resolve(MediaAsset, attrs.pop("media_ids"), "media_ids")
        if "catalogue_ids" in attrs:
            attrs["catalogues"] = self._resolve(Catalogue, attrs.pop("catalogue_ids"), "catalogue_ids")
        return attrs


class ProductSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    published = serializers.IntegerField()
    draft = serializers.IntegerField()
    archived = serializers.IntegerField()
    limit = serializers.IntegerField(allow_null=True)


class ProductBulkSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200)
    action = serializers.ChoiceField(
        choices=["publish", "unpublish", "archive", "restore", "delete", "add_to_catalogue", "remove_from_catalogue"]
    )
    catalogue_id = serializers.UUIDField(required=False, allow_null=True)


class CategorySummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    with_products = serializers.IntegerField()
    subcategories = serializers.IntegerField()
    total_products = serializers.IntegerField()
