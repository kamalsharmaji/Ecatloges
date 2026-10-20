from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing import entitlements
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM
from apps.catalogues.views import PublicCatalogueMixin
from apps.core.exceptions import PlanLimitExceeded
from apps.media_library.serializers import MediaBriefSerializer

from . import services
from .models import TrafficSource


class PublicEventSerializer(serializers.Serializer):
    visitor_id = serializers.CharField(max_length=64)
    product_id = serializers.UUIDField(required=False, allow_null=True)
    source = serializers.ChoiceField(choices=TrafficSource.choices, default=TrafficSource.DIRECT)


class PublicEventView(PublicCatalogueMixin, APIView):
    """Called by the public catalogue page; only published catalogues/products can be counted."""

    @extend_schema(request=PublicEventSerializer, responses={202: None})
    def post(self, request, business_slug, catalogue_slug):
        catalogue = self.get_catalogue()
        serializer = PublicEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        product = None
        if data.get("product_id"):
            product = self.visible_products(catalogue).filter(pk=data["product_id"]).first()
            if product is None:
                return Response({"recorded": False}, status=status.HTTP_202_ACCEPTED)
        recorded = services.record_view(
            catalogue=catalogue,
            product=product,
            visitor_id=data["visitor_id"],
            source=data["source"],
            user_agent=request.headers.get("User-Agent", ""),
        )
        return Response({"recorded": recorded}, status=status.HTTP_202_ACCEPTED)


# ---------------------------------------------------------------------------
# Business analytics
# ---------------------------------------------------------------------------
class TotalsSerializer(serializers.Serializer):
    catalogue_views = serializers.IntegerField()
    product_views = serializers.IntegerField()
    unique_visitors = serializers.IntegerField()
    products_viewed = serializers.IntegerField()
    enquiries = serializers.IntegerField()
    conversions = serializers.IntegerField()


class SeriesPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    catalogue_views = serializers.IntegerField()
    product_views = serializers.IntegerField()
    enquiries = serializers.IntegerField()


class BreakdownSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class TopCatalogueSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    views = serializers.IntegerField()
    enquiries = serializers.IntegerField(source="enquiry_count")
    cover = MediaBriefSerializer(allow_null=True)


class TopProductSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    views = serializers.IntegerField()
    enquiries = serializers.IntegerField(source="enquiry_count")
    thumbnail = serializers.SerializerMethodField()

    @extend_schema_field(MediaBriefSerializer(allow_null=True))
    def get_thumbnail(self, obj):
        media = list(obj.media_items.all())
        return MediaBriefSerializer(media[0].asset).data if media else None


# Built dynamically because "from" is a Python keyword but is the natural API field name.
RangeSerializer = type(
    "RangeSerializer",
    (serializers.Serializer,),
    {"from": serializers.DateField(), "to": serializers.DateField(), "tz": serializers.CharField(), "days": serializers.IntegerField()},
)


class OverviewSerializer(serializers.Serializer):
    range = RangeSerializer()
    totals = TotalsSerializer()
    previous = TotalsSerializer()
    series = SeriesPointSerializer(many=True)
    sources = BreakdownSerializer(many=True)
    devices = BreakdownSerializer(many=True)
    enquiries_by_status = BreakdownSerializer(many=True)
    top_catalogues = TopCatalogueSerializer(many=True)
    top_products = TopProductSerializer(many=True)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class AnalyticsOverviewView(BusinessScopedViewMixin, APIView):
    required_permissions = {"get": "analytics.view"}

    @extend_schema(
        parameters=[
            OpenApiParameter("from", str, description="Start date YYYY-MM-DD (default: 29 days before `to`)"),
            OpenApiParameter("to", str, description="End date YYYY-MM-DD, inclusive (default: today)"),
            OpenApiParameter("tz", str, description="IANA timezone for day boundaries, e.g. Asia/Kolkata"),
        ],
        responses=OverviewSerializer,
    )
    def get(self, request):
        # Uses the existing `analytics_enabled` plan flag from the purchased plan snapshot.
        subscription = entitlements.require_paid_access(request.business)
        if not subscription.limits.get("analytics_enabled"):
            raise PlanLimitExceeded("Analytics are not included in your plan. Upgrade to see insights.", code="feature_not_in_plan")
        start, end, tz = services.parse_range(request.query_params)
        return Response(OverviewSerializer(services.overview(request.business, start, end, tz)).data)
