import logging
from datetime import date

import django_filters
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit_logs import services as audit
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM
from apps.catalogues.views import PublicCatalogueMixin
from apps.products.models import ProductMedia

from . import services
from .models import Customer, Enquiry, EnquiryStatus
from .serializers import (
    CustomerDetailSerializer,
    CustomerSerializer,
    CustomerSummarySerializer,
    EnquiryBulkSerializer,
    EnquirySerializer,
    EnquirySummarySerializer,
    PublicEnquiryResponseSerializer,
    PublicEnquirySerializer,
)

logger = logging.getLogger("apps.enquiries")
MIN_FILL_MS = 1500  # humans don't complete the form faster than this
OPEN = (EnquiryStatus.NEW, EnquiryStatus.CONTACTED, EnquiryStatus.IN_PROGRESS)
CUSTOMER_AUDIT_FIELDS = ("name", "phone", "email", "company", "city", "notes")


# ---------------------------------------------------------------------------
# Public submission
# ---------------------------------------------------------------------------
class PublicEnquiryView(PublicCatalogueMixin, APIView):
    throttle_scope = "public_enquiry"

    @extend_schema(request=PublicEnquirySerializer, responses={201: PublicEnquiryResponseSerializer})
    def post(self, request, business_slug, catalogue_slug):
        catalogue = self.get_catalogue()
        if not catalogue.enquiries_enabled:
            raise exceptions.PermissionDenied("This catalogue is not accepting enquiries.")
        serializer = PublicEnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Anti-spam: bots fill the hidden field or submit instantly. Pretend success, store nothing.
        if data["website"] or data["elapsed_ms"] < MIN_FILL_MS:
            logger.warning("Enquiry dropped as spam", extra={"catalogue_id": str(catalogue.pk)})
            return Response({"status": "received", "reference": "—"}, status=status.HTTP_201_CREATED)

        product = None
        if data.get("product_id"):
            product = self.visible_products(catalogue).filter(pk=data["product_id"]).first()
            if product is None:
                raise exceptions.ValidationError({"product_id": ["This product is not available."]})
        enquiry, created = services.submit_public_enquiry(
            catalogue=catalogue,
            product=product,
            name=data["name"],
            phone=data["phone"],
            email=data["email"],
            message=data["message"],
            quantity=data.get("quantity"),
            source=data["source"],
            idempotency_key=data["idempotency_key"],
        )
        return Response(
            {"status": "received", "reference": str(enquiry.id)[:8].upper()},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Business panel
# ---------------------------------------------------------------------------
class EnquiryFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=EnquiryStatus.choices)
    catalogue = django_filters.UUIDFilter(field_name="catalogue_id")
    product = django_filters.UUIDFilter(field_name="product_id")
    customer = django_filters.UUIDFilter(field_name="customer_id")
    source = django_filters.CharFilter()
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Enquiry
        fields = ["status", "catalogue", "product", "customer", "source"]


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class EnquiryViewSet(
    BusinessScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = EnquirySerializer
    queryset = Enquiry.objects.select_related("customer", "catalogue", "product").prefetch_related(
        Prefetch("product__media_items", queryset=ProductMedia.objects.select_related("asset"))
    )
    http_method_names = ["get", "patch", "delete", "post"]
    filterset_class = EnquiryFilter
    search_fields = ["name", "phone", "email", "message", "product_name", "catalogue_name"]
    ordering_fields = ["created_at", "status", "name"]
    ordering = ["-created_at"]
    required_permissions = {
        "list": "enquiry.view",
        "retrieve": "enquiry.view",
        "summary": "enquiry.view",
        "partial_update": "enquiry.update",
        "destroy": "enquiry.delete",
        "bulk": (),  # per action below
    }

    def perform_update(self, serializer):
        serializer.instance = services.update_enquiry(serializer.instance, user=self.request.user, **serializer.validated_data)

    def perform_destroy(self, instance):
        services.delete_enquiries([instance], user=self.request.user)

    @extend_schema(responses=EnquirySummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        data = Enquiry.objects.filter(business=request.business).aggregate(
            total=Count("id"),
            this_month=Count("id", filter=Q(created_at__gte=month_start)),
            **{s.value: Count("id", filter=Q(status=s.value)) for s in EnquiryStatus},
        )
        return Response(EnquirySummarySerializer(data).data)

    @extend_schema(request=EnquiryBulkSerializer, responses={200: None})
    @action(detail=False, methods=["post"])
    def bulk(self, request):
        serializer = EnquiryBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        needed = "enquiry.delete" if data["action"] == "delete" else "enquiry.update"
        if not request.business_context.has(needed):
            raise exceptions.PermissionDenied()
        enquiries = list(Enquiry.objects.filter(business=request.business, pk__in=data["ids"]))
        if len(enquiries) != len(set(data["ids"])):
            raise exceptions.NotFound("One or more enquiries were not found.")
        if data["action"] == "delete":
            services.delete_enquiries(enquiries, user=request.user)
            return Response({"updated": len(enquiries)})
        if not data.get("status"):
            raise exceptions.ValidationError({"status": ["Choose a status."]})
        return Response({"updated": services.bulk_set_status(enquiries, data["status"], user=request.user)})


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class CustomerViewSet(BusinessScopedViewMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    http_method_names = ["get", "post", "patch", "delete"]
    search_fields = ["name", "phone", "email", "company", "city"]
    ordering_fields = ["name", "created_at", "last_enquiry_at", "enquiry_count"]
    ordering = ["-last_enquiry_at", "-created_at"]
    filterset_fields = ["city"]
    required_permissions = {
        "list": "customer.view",
        "retrieve": "customer.view",
        "summary": "customer.view",
        "create": "customer.manage",
        "partial_update": "customer.manage",
        "destroy": "customer.manage",
    }

    def get_serializer_class(self):
        return CustomerDetailSerializer if self.action == "retrieve" else CustomerSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(
                enquiry_count=Count("enquiries", distinct=True),
                open_enquiry_count=Count("enquiries", filter=Q(enquiries__status__in=OPEN), distinct=True),
                converted_count=Count("enquiries", filter=Q(enquiries__status=EnquiryStatus.CONVERTED), distinct=True),
            )
        )

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        if self.request.query_params.get("has_open_enquiries") == "true":
            queryset = queryset.filter(open_enquiry_count__gt=0)
        return queryset

    def perform_create(self, serializer):
        data = serializer.validated_data
        services.check_customer_uniqueness(self.request.business, phone=data.get("phone", ""), email=data.get("email", ""))
        with transaction.atomic():
            serializer.save(business=self.request.business)
            audit.record_ctx(self.request.business_context, "customer.created", target=serializer.instance)

    def perform_update(self, serializer):
        data = serializer.validated_data
        services.check_customer_uniqueness(
            self.request.business, phone=data.get("phone", ""), email=data.get("email", ""), exclude_pk=serializer.instance.pk
        )
        before = audit.snapshot(serializer.instance, CUSTOMER_AUDIT_FIELDS)
        with transaction.atomic():
            serializer.save()
            # Contact fields are recorded only as "changed" (values redacted).
            changes = audit.diff(before, audit.snapshot(serializer.instance, CUSTOMER_AUDIT_FIELDS))
            if changes:
                audit.record_ctx(self.request.business_context, "customer.updated", target=serializer.instance, changes=changes)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        response.data = CustomerSerializer(self.get_queryset().get(pk=response.data["id"])).data
        return response

    def perform_destroy(self, instance):
        # Enquiries are kept (customer link set to NULL; their contact snapshot remains).
        with transaction.atomic():
            audit.record_ctx(self.request.business_context, "customer.deleted", target=instance)
            instance.delete()

    @extend_schema(responses=CustomerSummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        month_start = date.today().replace(day=1)
        qs = Customer.objects.filter(business=request.business)
        data = {
            "total": qs.count(),
            "new_this_month": qs.filter(created_at__date__gte=month_start).count(),
            "with_open_enquiries": qs.filter(enquiries__status__in=OPEN).distinct().count(),
            "converted": qs.filter(enquiries__status=EnquiryStatus.CONVERTED).distinct().count(),
        }
        return Response(CustomerSummarySerializer(data).data)
