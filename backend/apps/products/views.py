import django_filters
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.billing import entitlements
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM
from apps.catalogues.models import Catalogue, CatalogueItem

from . import services
from .models import Category, CategoryStatus, Product, ProductMedia, ProductStatus, StockStatus
from .serializers import (
    CategorySerializer,
    CategorySummarySerializer,
    ProductBulkSerializer,
    ProductListSerializer,
    ProductSerializer,
    ProductSummarySerializer,
)


def _descendant_ids(business, category_id) -> list:
    ids, level = [category_id], [category_id]
    for _ in range(services.MAX_CATEGORY_DEPTH):
        level = list(Category.objects.filter(business=business, parent_id__in=level).values_list("pk", flat=True))
        if not level:
            break
        ids += level
    return ids


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
class CategoryFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=CategoryStatus.choices)
    parent = django_filters.UUIDFilter(field_name="parent_id")
    top_level = django_filters.BooleanFilter(field_name="parent", lookup_expr="isnull")

    class Meta:
        model = Category
        fields = ["status", "parent", "top_level"]


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class CategoryViewSet(BusinessScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    queryset = Category.objects.select_related("parent", "parent__parent", "image")
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_class = CategoryFilter
    search_fields = ["name", "description"]
    ordering_fields = ["sort_order", "name", "created_at", "product_count"]
    ordering = ["sort_order", "name"]
    required_permissions = {
        "list": "category.view",
        "retrieve": "category.view",
        "summary": "category.view",
        "create": "category.create",
        "partial_update": "category.update",
        "destroy": "category.delete",
    }

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(product_count=Count("products", distinct=True), children_count=Count("children", distinct=True))
        )

    def perform_create(self, serializer):
        serializer.instance = services.save_category(self.request.business_context, **serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = services.save_category(
            self.request.business_context, instance=serializer.instance, **serializer.validated_data
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        response.data = self.get_serializer(self.get_queryset().get(pk=response.data["id"])).data
        return response

    @extend_schema(
        parameters=[OpenApiParameter("reassign_to", str, description="Category id that receives this category's products.")]
    )
    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        target = None
        if reassign := request.query_params.get("reassign_to"):
            target = Category.objects.filter(business=request.business, pk=reassign).first() if _is_uuid(reassign) else None
            if target is None:
                raise exceptions.ValidationError({"reassign_to": ["Select a valid category."]})
        services.delete_category(request.business_context, category, reassign_to=target)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses=CategorySummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = Category.objects.filter(business=request.business)
        data = {
            "total": qs.count(),
            "with_products": qs.filter(products__isnull=False).distinct().count(),
            "subcategories": qs.filter(parent__isnull=False).count(),
            "total_products": Product.objects.filter(business=request.business).count(),
        }
        return Response(CategorySummarySerializer(data).data)


def _is_uuid(value: str) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class ProductFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=ProductStatus.choices)
    stock_status = django_filters.ChoiceFilter(choices=StockStatus.choices)
    is_featured = django_filters.BooleanFilter()
    category = django_filters.UUIDFilter(method="filter_category", label="Category (includes subcategories)")
    catalogue = django_filters.UUIDFilter(method="filter_catalogue")
    exclude_catalogue = django_filters.UUIDFilter(method="filter_exclude_catalogue")

    class Meta:
        model = Product
        fields = ["status", "stock_status", "is_featured", "category", "catalogue"]

    def filter_category(self, queryset, name, value):
        return queryset.filter(category_id__in=_descendant_ids(self.request.business, value))

    def filter_catalogue(self, queryset, name, value):
        return queryset.filter(catalogue_items__catalogue_id=value)

    def filter_exclude_catalogue(self, queryset, name, value):
        return queryset.exclude(catalogue_items__catalogue_id=value)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class ProductViewSet(BusinessScopedViewMixin, viewsets.ModelViewSet):
    queryset = Product.objects.all()
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_class = ProductFilter
    search_fields = ["name", "sku", "short_description"]
    ordering_fields = ["created_at", "updated_at", "name", "price", "position", "view_count", "enquiry_count"]
    ordering = ["-created_at"]
    required_permissions = {
        "list": "product.view",
        "retrieve": "product.view",
        "summary": "product.view",
        "create": "product.create",
        "partial_update": "product.update",
        "destroy": "product.delete",
        "publish": "product.publish",
        "unpublish": "product.publish",
        "archive": "product.update",
        "restore": "product.update",
        "duplicate": "product.create",
        "bulk": (),  # checked per action in services.bulk_action
    }

    def get_serializer_class(self):
        return ProductListSerializer if self.action == "list" else ProductSerializer

    def get_queryset(self):
        from apps.analytics.models import AnalyticsEvent, EventType
        from apps.enquiries.models import Enquiry

        views = (
            AnalyticsEvent.objects.filter(product=OuterRef("pk"), event_type=EventType.PRODUCT_VIEW)
            .values("product").annotate(n=Count("id")).values("n")
        )
        enquiries = Enquiry.objects.filter(product=OuterRef("pk")).values("product").annotate(n=Count("id")).values("n")
        return (
            super()
            .get_queryset()
            .annotate(
                view_count=Coalesce(Subquery(views, output_field=IntegerField()), 0),
                enquiry_count=Coalesce(Subquery(enquiries, output_field=IntegerField()), 0),
            )
            .select_related("category")
            .prefetch_related(
                Prefetch("media_items", queryset=ProductMedia.objects.select_related("asset")),
                Prefetch("catalogue_items", queryset=CatalogueItem.objects.select_related("catalogue__cover")),
            )
            .distinct()
        )

    def _respond(self, product, code=status.HTTP_200_OK):
        return Response(ProductSerializer(self.get_queryset().get(pk=product.pk), context=self.get_serializer_context()).data, status=code)

    def _check_publish_permission(self, data, instance=None):
        target = data.get("status")
        if target and target != getattr(instance, "status", None) and (
            target == ProductStatus.PUBLISHED or getattr(instance, "status", None) == ProductStatus.PUBLISHED
        ):
            if not self.request.business_context.has("product.publish"):
                raise exceptions.PermissionDenied("You do not have permission to publish or unpublish products.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._check_publish_permission(serializer.validated_data)
        product = services.create_product(request.business_context, user=request.user, **serializer.validated_data)
        return self._respond(product, status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self._check_publish_permission(serializer.validated_data, instance)
        product = services.update_product(request.business_context, instance, **serializer.validated_data)
        return self._respond(product)

    def perform_destroy(self, instance):
        services.delete_product(self.request.business_context, instance)

    def _status_action(self, target):
        product = services.set_status(self.request.business_context, self.get_object(), target)
        return self._respond(product)

    @extend_schema(request=None, responses=ProductSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self._status_action(ProductStatus.PUBLISHED)

    @extend_schema(request=None, responses=ProductSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        return self._status_action(ProductStatus.DRAFT)

    @extend_schema(request=None, responses=ProductSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._status_action(ProductStatus.ARCHIVED)

    @extend_schema(request=None, responses=ProductSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        return self._status_action(ProductStatus.DRAFT)

    @extend_schema(request=None, responses={201: ProductSerializer})
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        copy = services.duplicate_product(request.business_context, self.get_object(), user=request.user)
        return self._respond(copy, status.HTTP_201_CREATED)

    @extend_schema(request=ProductBulkSerializer, responses={200: None})
    @action(detail=False, methods=["post"])
    def bulk(self, request):
        serializer = ProductBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        products = list(Product.objects.filter(business=request.business, pk__in=data["ids"]))
        if len(products) != len(set(data["ids"])):
            raise exceptions.NotFound("One or more products were not found.")
        catalogue = None
        if data.get("catalogue_id"):
            catalogue = Catalogue.objects.filter(business=request.business, pk=data["catalogue_id"]).first()
            if catalogue is None:
                raise exceptions.ValidationError({"catalogue_id": ["Select a valid catalogue."]})
        count = services.bulk_action(request.business_context, products=products, action=data["action"], catalogue=catalogue)
        return Response({"updated": count})

    @extend_schema(responses=ProductSummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        counts = Product.objects.filter(business=request.business).aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=ProductStatus.PUBLISHED)),
            draft=Count("id", filter=Q(status=ProductStatus.DRAFT)),
            archived=Count("id", filter=Q(status=ProductStatus.ARCHIVED)),
        )
        subscription = entitlements.current_subscription(request.business)
        counts["limit"] = subscription.limits.get("max_products") if subscription else None
        return Response(ProductSummarySerializer(counts).data)
