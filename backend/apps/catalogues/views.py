import uuid

import django_filters
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.billing import entitlements
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.models import Business
from apps.businesses.views import BUSINESS_HEADER_PARAM
from apps.core.exceptions import BusinessRuleViolation
from apps.products.models import Category, CategoryStatus, Product, ProductMedia, ProductStatus

from . import qr, services
from .models import Catalogue, CatalogueItem, CatalogueStatus
from .serializers import (
    CatalogueItemSerializer,
    CatalogueSerializer,
    CatalogueSummarySerializer,
    ProductIdsSerializer,
    PublicCatalogueSerializer,
    PublicProductDetailSerializer,
    PublicProductSerializer,
)


class CatalogueFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=CatalogueStatus.choices)
    category = django_filters.UUIDFilter(method="filter_category", label="Contains products of this category")

    class Meta:
        model = Catalogue
        fields = ["status", "category"]

    def filter_category(self, queryset, name, value):
        return queryset.filter(items__product__category_id=value).distinct()


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class CatalogueViewSet(BusinessScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = CatalogueSerializer
    queryset = Catalogue.objects.select_related("business", "cover", "logo")
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_class = CatalogueFilter
    search_fields = ["name", "description", "slug"]
    ordering_fields = ["created_at", "updated_at", "name", "product_count", "view_count", "enquiry_count"]
    ordering = ["-created_at"]
    required_permissions = {
        "list": "catalogue.view",
        "retrieve": "catalogue.view",
        "summary": "catalogue.view",
        "items": "catalogue.view",
        "create": "catalogue.create",
        "partial_update": "catalogue.update",
        "destroy": "catalogue.delete",
        "publish": "catalogue.publish",
        "unpublish": "catalogue.publish",
        "archive": "catalogue.update",
        "restore": "catalogue.update",
        "add_products": ("catalogue.update", "product.view"),
        "remove_products": "catalogue.update",
        "reorder": "catalogue.update",
        "qr": "qrcode.view",
    }

    def get_queryset(self):
        from apps.analytics.models import AnalyticsEvent, EventType
        from apps.enquiries.models import Enquiry

        views = (
            AnalyticsEvent.objects.filter(catalogue=OuterRef("pk"), event_type=EventType.CATALOGUE_VIEW)
            .values("catalogue").annotate(n=Count("id")).values("n")
        )
        enquiries = Enquiry.objects.filter(catalogue=OuterRef("pk")).values("catalogue").annotate(n=Count("id")).values("n")
        return (
            super()
            .get_queryset()
            .annotate(
                product_count=Count("items", distinct=True),
                published_product_count=Count(
                    "items", filter=Q(items__product__status=ProductStatus.PUBLISHED), distinct=True
                ),
                # All-time counters (subqueries keep them independent of the item join above).
                view_count=Coalesce(Subquery(views, output_field=IntegerField()), 0),
                enquiry_count=Coalesce(Subquery(enquiries, output_field=IntegerField()), 0),
            )
        )

    @extend_schema(
        parameters=[
            OpenApiParameter("type", str, enum=["png", "svg"], description="Image type (default png). Not `format`, which DRF reserves."),
            OpenApiParameter("tracking", bool, description="Append ?src=qr so visits are attributed to the QR code (default true)"),
            OpenApiParameter("size", int, description="PNG size in pixels, 200–2000 (default 600)"),
            OpenApiParameter("color", str, enum=["brand", "black"], description="Use the catalogue brand colour if it scans well"),
        ],
        responses={(200, "image/png"): bytes, (200, "image/svg+xml"): bytes},
    )
    @action(detail=True, methods=["get"])
    def qr(self, request, pk=None):
        """QR code for the catalogue's public link. Only published catalogues have a working link."""
        catalogue = self.get_object()
        if catalogue.status != CatalogueStatus.PUBLISHED:
            raise BusinessRuleViolation("Publish the catalogue before creating its QR code.", code="catalogue_not_published")
        fmt = request.query_params.get("type", "png")
        if fmt not in ("png", "svg"):
            raise exceptions.ValidationError({"type": ["Use png or svg."]})
        try:
            size = min(max(int(request.query_params.get("size", 600)), 200), 2000)
        except ValueError:
            raise exceptions.ValidationError({"size": ["Enter a number of pixels."]}) from None
        tracking = request.query_params.get("tracking", "true").lower() != "false"
        color = qr.readable_color(catalogue.theme_color) if request.query_params.get("color") == "brand" else "#000000"
        target = qr.qr_target(catalogue, tracking=tracking)
        if fmt == "svg":
            response = HttpResponse(qr.render_svg(target, color=color), content_type="image/svg+xml")
        else:
            response = HttpResponse(qr.render_png(target, color=color, size=size), content_type="image/png")
        response["Content-Disposition"] = f'attachment; filename="{catalogue.slug}-qr.{fmt}"'
        response["X-QR-Target"] = target
        response["Access-Control-Expose-Headers"] = "X-QR-Target"
        return response

    def _respond(self, catalogue, code=status.HTTP_200_OK):
        return Response(self.get_serializer(self.get_queryset().get(pk=catalogue.pk)).data, status=code)

    def _check_publish(self, data, instance=None):
        target = data.get("status")
        current = getattr(instance, "status", None)
        if target and target != current and CatalogueStatus.PUBLISHED in (target, current):
            if not self.request.business_context.has("catalogue.publish"):
                raise exceptions.PermissionDenied("You do not have permission to publish or unpublish catalogues.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._check_publish(serializer.validated_data)
        catalogue = services.create_catalogue(request.business_context, user=request.user, **serializer.validated_data)
        return self._respond(catalogue, status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self._check_publish(serializer.validated_data, instance)
        catalogue = services.update_catalogue(request.business_context, instance, **serializer.validated_data)
        return self._respond(catalogue)

    def perform_destroy(self, instance):
        services.delete_catalogue(self.request.business_context, instance)

    def _status(self, target):
        return self._respond(services.update_catalogue(self.request.business_context, self.get_object(), status=target))

    @extend_schema(request=None, responses=CatalogueSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self._status(CatalogueStatus.PUBLISHED)

    @extend_schema(request=None, responses=CatalogueSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        return self._status(CatalogueStatus.DRAFT)

    @extend_schema(request=None, responses=CatalogueSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._status(CatalogueStatus.ARCHIVED)

    @extend_schema(request=None, responses=CatalogueSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        return self._status(CatalogueStatus.DRAFT)

    @extend_schema(responses=CatalogueSummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        counts = Catalogue.objects.filter(business=request.business).aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=CatalogueStatus.PUBLISHED)),
            draft=Count("id", filter=Q(status=CatalogueStatus.DRAFT)),
            archived=Count("id", filter=Q(status=CatalogueStatus.ARCHIVED)),
        )
        subscription = entitlements.current_subscription(request.business)
        counts["limit"] = subscription.limits.get("max_catalogues") if subscription else None
        return Response(CatalogueSummarySerializer(counts).data)

    # -- Products inside a catalogue -------------------------------------------------------
    @extend_schema(responses=CatalogueItemSerializer(many=True))
    @action(detail=True, methods=["get"])
    def items(self, request, pk=None):
        catalogue = self.get_object()
        items = (
            CatalogueItem.objects.filter(catalogue=catalogue)
            .select_related("product__category")
            .prefetch_related(Prefetch("product__media_items", queryset=ProductMedia.objects.select_related("asset")))
        )
        page = self.paginate_queryset(items)
        return self.get_paginated_response(CatalogueItemSerializer(page, many=True).data)

    def _products(self, ids):
        products = list(Product.objects.filter(business=self.request.business, pk__in=ids))
        if len(products) != len(set(ids)):
            raise exceptions.ValidationError({"product_ids": ["One or more products were not found."]})
        order = {pid: i for i, pid in enumerate(ids)}
        return sorted(products, key=lambda p: order[p.pk])

    @extend_schema(request=ProductIdsSerializer, responses={200: None})
    @action(detail=True, methods=["post"], url_path="items/add")
    def add_products(self, request, pk=None):
        serializer = ProductIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        added = services.add_products(
            request.business_context, self.get_object(), self._products(serializer.validated_data["product_ids"])
        )
        return Response({"added": added})

    @extend_schema(request=ProductIdsSerializer, responses={200: None})
    @action(detail=True, methods=["post"], url_path="items/remove")
    def remove_products(self, request, pk=None):
        serializer = ProductIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        removed = services.remove_products(
            self.get_object(), serializer.validated_data["product_ids"], ctx=request.business_context
        )
        return Response({"removed": removed})

    @extend_schema(request=ProductIdsSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="items/reorder")
    def reorder(self, request, pk=None):
        serializer = ProductIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.reorder(self.get_object(), serializer.validated_data["product_ids"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Public catalogue (anonymous)
# ---------------------------------------------------------------------------
class PublicCatalogueMixin:
    """
    Resolve a catalogue that may be shown publicly. Everything else is an indistinguishable 404:
    unknown business/catalogue, suspended business, no paid subscription, draft or archived catalogue.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_view"

    def get_catalogue(self) -> Catalogue:
        business = get_object_or_404(Business, slug=self.kwargs["business_slug"], status=Business.Status.ACTIVE)
        catalogue = get_object_or_404(
            Catalogue.objects.select_related("business", "business__logo", "cover", "logo"),
            business=business,
            slug=self.kwargs["catalogue_slug"],
            status=CatalogueStatus.PUBLISHED,
        )
        if entitlements.current_subscription(business) is None:
            raise exceptions.NotFound()
        return catalogue

    def visible_products(self, catalogue):
        return (
            Product.objects.filter(catalogue_items__catalogue=catalogue, status=ProductStatus.PUBLISHED)
            .select_related("category")
            .prefetch_related(Prefetch("media_items", queryset=ProductMedia.objects.select_related("asset")))
            .order_by("catalogue_items__position", "name")
        )


class PublicCatalogueView(PublicCatalogueMixin, APIView):
    @extend_schema(responses=PublicCatalogueSerializer)
    def get(self, request, business_slug, catalogue_slug):
        catalogue = self.get_catalogue()
        products = self.visible_products(catalogue)
        counts = dict(products.values_list("category_id").annotate(n=Count("id")).values_list("category_id", "n"))
        categories = [
            {"id": c.id, "name": c.name, "icon": c.icon, "product_count": counts[c.id], "image": c.image}
            for c in Category.objects.filter(pk__in=counts, status=CategoryStatus.PUBLISHED).select_related("image")
        ]
        data = {
            **{f: getattr(catalogue, f) for f in (
                "name", "slug", "description", "tagline", "theme_color", "show_prices",
                "whatsapp_number", "contact_email", "enquiries_enabled", "cover", "logo", "public_url",
            )},
            "business": catalogue.business,
            "categories": sorted(categories, key=lambda c: (-c["product_count"], c["name"])),
            "product_count": sum(counts.values()),
        }
        return Response(PublicCatalogueSerializer(data).data)


class PublicProductListView(PublicCatalogueMixin, APIView):
    @extend_schema(responses=PublicProductSerializer(many=True))
    def get(self, request, business_slug, catalogue_slug):
        from apps.core.pagination import StandardPagination

        catalogue = self.get_catalogue()
        products = self.visible_products(catalogue)
        if category := request.query_params.get("category"):
            try:
                products = products.filter(category_id=uuid.UUID(category))
            except ValueError:
                products = products.none()
        if search := request.query_params.get("search", "").strip()[:100]:
            products = products.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(short_description__icontains=search))
        if request.query_params.get("featured") == "true":
            products = products.filter(is_featured=True)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(products, request, view=self)
        context = {"catalogue_shows_prices": catalogue.show_prices}
        return paginator.get_paginated_response(PublicProductSerializer(page, many=True, context=context).data)


class PublicCatalogueQrView(PublicCatalogueMixin, APIView):
    """SVG QR code for the public share sheet (published catalogues only, like the page itself)."""

    @extend_schema(responses={(200, "image/svg+xml"): bytes})
    def get(self, request, business_slug, catalogue_slug):
        catalogue = self.get_catalogue()
        svg = qr.render_svg(qr.qr_target(catalogue), color=qr.readable_color(catalogue.theme_color))
        response = HttpResponse(svg, content_type="image/svg+xml")
        response["Cache-Control"] = "public, max-age=3600"
        return response


class PublicProductDetailView(PublicCatalogueMixin, APIView):
    @extend_schema(responses=PublicProductDetailSerializer)
    def get(self, request, business_slug, catalogue_slug, product_id):
        catalogue = self.get_catalogue()
        product = get_object_or_404(self.visible_products(catalogue), pk=product_id)
        return Response(PublicProductDetailSerializer(product, context={"catalogue_shows_prices": catalogue.show_prices}).data)
