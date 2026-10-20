from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.platform import HasPlatformPermission
from apps.audit_logs import services as audit
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM
from apps.core.exceptions import BusinessRuleViolation

from . import entitlements, services
from .invoices import render_invoice_pdf
from .models import Invoice, Payment, Plan, Subscription
from .money import to_minor
from .providers import mock
from .serializers import (
    AdminCancelSerializer,
    AdminInvoiceSerializer,
    AdminPaymentSerializer,
    AdminPlanSerializer,
    AdminSubscriptionSerializer,
    BillingOverviewSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    PlanChoiceSerializer,
    PlanSerializer,
    QuoteSerializer,
    SimulatePaymentSerializer,
    SubscriptionSerializer,
)


def _plan_or_400(plan_id) -> Plan:
    plan = Plan.objects.filter(pk=plan_id).first()
    if plan is None:
        raise exceptions.ValidationError({"plan_id": ["Select a valid plan."]})
    return plan


def _pdf_response(invoice: Invoice) -> HttpResponse:
    response = HttpResponse(render_invoice_pdf(invoice), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{invoice.number}.pdf"'
    return response


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------
class PublicPlanListView(generics.ListAPIView):
    """Plans currently offered for purchase."""

    permission_classes = [AllowAny]
    serializer_class = PlanSerializer
    pagination_class = None
    filterset_fields = ["interval"]

    def get_queryset(self):
        return services.purchasable_plans().filter(is_public=True)


class WebhookView(APIView):
    """Payment gateway callbacks. Authenticated by the provider's signature, not by a user."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "webhook"

    @extend_schema(request=None, responses={200: None})
    def post(self, request, provider):
        outcome = services.process_webhook(provider, request.body, request.headers)
        return Response({"status": outcome})


# ---------------------------------------------------------------------------
# Business panel (X-Business-ID)
# ---------------------------------------------------------------------------
@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class BillingOverviewView(BusinessScopedViewMixin, APIView):
    required_permissions = {"get": "subscription.view"}

    @extend_schema(responses=BillingOverviewSerializer)
    def get(self, request):
        business = request.business
        current = services.current_subscription(business)
        limits = current.limits if current else {}
        used = entitlements.usage_for(business)
        usage = [
            {"key": key, "label": label, "used": used.get(key), "limit": limits.get(key)}
            for key, label in entitlements.LIMIT_LABELS.items()
        ]
        data = {
            "subscription": current,
            "scheduled": Subscription.objects.filter(business=business, status=Subscription.Status.SCHEDULED).first(),
            "open_checkout": Payment.objects.filter(business=business, status=Payment.Status.CREATED).first(),
            "has_paid_access": current is not None,
            "usage": usage,
            "email_verified": request.user.is_email_verified,
            "payments_test_mode": settings.PAYMENT_PROVIDER == "mock",
        }
        return Response(BillingOverviewSerializer(data).data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class SubscriptionActionView(BusinessScopedViewMixin, APIView):
    required_permissions = {"post": "subscription.manage"}
    action_name = ""

    @extend_schema(request=PlanChoiceSerializer, responses=SubscriptionSerializer)
    def post(self, request):
        business = request.business
        if self.action_name == "cancel":
            sub = services.cancel_subscription(business, actor=request.user)
        elif self.action_name == "resume":
            sub = services.resume_subscription(business, actor=request.user)
        elif self.action_name == "schedule-downgrade":
            serializer = PlanChoiceSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            sub = services.schedule_downgrade(
                business, _plan_or_400(serializer.validated_data["plan_id"]), actor=request.user
            )
        else:
            sub = services.clear_scheduled_downgrade(business, actor=request.user)
        return Response(SubscriptionSerializer(sub).data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class SubscriptionHistoryView(BusinessScopedViewMixin, generics.ListAPIView):
    serializer_class = SubscriptionSerializer
    queryset = Subscription.objects.select_related("plan", "pending_plan")
    required_permissions = {"get": "subscription.view"}
    filterset_fields = ["status"]


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class QuoteView(BusinessScopedViewMixin, APIView):
    required_permissions = {"get": "subscription.view"}

    @extend_schema(parameters=[OpenApiParameter("plan_id", str, required=True)], responses=QuoteSerializer)
    def get(self, request):
        serializer = PlanChoiceSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        quote = services.build_quote(request.business, _plan_or_400(serializer.validated_data["plan_id"]))
        return Response(QuoteSerializer(quote).data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class CheckoutView(BusinessScopedViewMixin, APIView):
    """Create (or return the identical open) checkout. Never activates anything by itself."""

    required_permissions = {"post": "subscription.manage"}
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=PlanChoiceSerializer, responses={201: PaymentSerializer})
    def post(self, request):
        serializer = PlanChoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = _plan_or_400(serializer.validated_data["plan_id"])
        payment = services.start_checkout(request.business_context, user=request.user, plan=plan)
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class PaymentViewSet(BusinessScopedViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = PaymentSerializer
    queryset = Payment.objects.select_related("subscription", "invoice")
    filterset_fields = ["status", "kind"]
    required_permissions = {
        "list": "payment.view",
        "retrieve": "payment.view",
        "refresh": "subscription.manage",
        "confirm": "subscription.manage",
        "cancel": "subscription.manage",
        "simulate": "subscription.manage",
    }
    throttle_scope = "auth"

    def get_throttles(self):
        throttles = super().get_throttles()
        # Actions that call the payment gateway get the strict scoped limit as well.
        if getattr(self, "action", None) in ("refresh", "confirm", "simulate"):
            throttles.append(ScopedRateThrottle())
        return throttles

    @extend_schema(request=None, responses=PaymentSerializer)
    @action(detail=True, methods=["post"])
    def refresh(self, request, pk=None):
        """Reconcile with the gateway (e.g. after returning from checkout)."""
        payment = services.reconcile_payment(self.get_object())
        audit.record_platform(request.user, "payment.reconciled", target=payment, business=payment.business,
                              target_label=f"Payment {payment.currency} {payment.amount}", metadata={"status": payment.status})
        return Response(PaymentSerializer(payment).data)

    @extend_schema(request=None, responses=PaymentSerializer)
    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """Browser-side completion data; verified, then reconciled server-side."""
        payment = services.confirm_from_client(self.get_object(), dict(request.data))
        return Response(PaymentSerializer(payment).data)

    @extend_schema(request=None, responses=PaymentSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        payment = services.cancel_checkout(self.get_object())
        return Response(PaymentSerializer(payment).data)

    @extend_schema(request=SimulatePaymentSerializer, responses=PaymentSerializer)
    @action(detail=True, methods=["post"])
    def simulate(self, request, pk=None):
        """
        DEVELOPMENT ONLY. Sends a correctly signed mock-gateway webhook through the real webhook
        pipeline. Unavailable (404) unless the mock provider is enabled.
        """
        payment = self.get_object()
        if not settings.PAYMENT_MOCK_ENABLED or payment.provider != "mock":
            raise exceptions.NotFound()
        serializer = SimulatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        body = mock.build_event_body(
            order_id=payment.provider_order_id,
            status=data["outcome"],
            amount_minor=data.get("amount_minor", to_minor(payment.amount)),
            currency=data.get("currency", payment.currency).upper(),
            failure_code="simulated_decline" if data["outcome"] == "failed" else "",
            failure_message="Simulated failure (test mode)." if data["outcome"] == "failed" else "",
        )
        services.process_webhook("mock", body, {mock.SIGNATURE_HEADER: mock.sign(body)})
        payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class InvoiceViewSet(BusinessScopedViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InvoiceSerializer
    queryset = Invoice.objects.prefetch_related("lines")
    filterset_fields = ["status"]
    search_fields = ["number"]
    required_permissions = {"list": "invoice.view", "retrieve": "invoice.view", "pdf": "invoice.view"}

    @extend_schema(responses={(200, "application/pdf"): bytes})
    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        return _pdf_response(self.get_object())


# ---------------------------------------------------------------------------
# Super Admin panel (platform permissions)
# ---------------------------------------------------------------------------
class PlatformAdminMixin:
    permission_classes = [IsAuthenticated, HasPlatformPermission]


class AdminPlanViewSet(PlatformAdminMixin, viewsets.ModelViewSet):
    serializer_class = AdminPlanSerializer
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_fields = ["interval", "is_active", "is_public", "is_development_seed"]
    search_fields = ["code", "name"]
    ordering_fields = ["sort_order", "price", "created_at"]
    required_platform_permissions = {
        "list": "platform.plan.view",
        "retrieve": "platform.plan.view",
        "create": "platform.plan.manage",
        "partial_update": "platform.plan.manage",
        "destroy": "platform.plan.manage",
    }

    def get_queryset(self):
        # Aggregation drops Meta.ordering, so order explicitly for stable pagination.
        return Plan.objects.annotate(
            subscriber_count=Count("subscriptions", filter=Q(subscriptions__status__in=Subscription.CURRENT_STATUSES))
        ).order_by("interval", "sort_order", "price", "code")

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save()
            audit.record_platform(self.request.user, "plan.created", target=serializer.instance,
                                  metadata={"price": serializer.instance.price, "interval": serializer.instance.interval})

    def perform_update(self, serializer):
        fields = [f for f in serializer.validated_data if f != "description"]
        before = audit.snapshot(serializer.instance, fields)
        with transaction.atomic():
            serializer.save()
            if changes := audit.diff(before, audit.snapshot(serializer.instance, fields)):
                audit.record_platform(self.request.user, "plan.updated", target=serializer.instance, changes=changes)

    def perform_destroy(self, instance):
        if instance.subscriptions.exists():
            raise BusinessRuleViolation(
                "This plan has subscriptions and is kept for history. Deactivate it instead.", code="plan_in_use"
            )
        with transaction.atomic():
            audit.record_platform(self.request.user, "plan.deleted", target=instance)
            instance.delete()


class AdminSubscriptionViewSet(PlatformAdminMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AdminSubscriptionSerializer
    queryset = Subscription.objects.select_related("business", "plan", "pending_plan")
    filterset_fields = ["status", "business", "plan", "plan_interval"]
    search_fields = ["business__name", "plan_name", "plan_code"]
    required_platform_permissions = {
        "list": "platform.subscription.view",
        "retrieve": "platform.subscription.view",
        "cancel": "platform.subscription.manage",
    }

    @extend_schema(request=AdminCancelSerializer, responses=AdminSubscriptionSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = AdminCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sub = services.admin_cancel_subscription(
            self.get_object(), immediately=serializer.validated_data["immediately"], actor=request.user
        )
        return Response(AdminSubscriptionSerializer(sub).data)


class AdminPaymentViewSet(PlatformAdminMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AdminPaymentSerializer
    queryset = Payment.objects.select_related("business", "subscription", "invoice").prefetch_related("events")
    filterset_fields = ["status", "kind", "business", "provider", "is_test", "requires_attention"]
    search_fields = ["business__name", "provider_order_id", "provider_payment_id"]
    required_platform_permissions = {
        "list": "platform.payment.view",
        "retrieve": "platform.payment.view",
        "reconcile": "platform.payment.reconcile",
    }

    @extend_schema(request=None, responses=AdminPaymentSerializer)
    @action(detail=True, methods=["post"])
    def reconcile(self, request, pk=None):
        payment = services.reconcile_payment(self.get_object())
        audit.record_platform(request.user, "payment.reconciled", target=payment, business=payment.business,
                              target_label=f"Payment {payment.currency} {payment.amount}", metadata={"status": payment.status})
        return Response(AdminPaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)


class AdminInvoiceViewSet(PlatformAdminMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AdminInvoiceSerializer
    queryset = Invoice.objects.select_related("business").prefetch_related("lines")
    filterset_fields = ["status", "business", "is_test"]
    search_fields = ["number", "business__name"]
    required_platform_permissions = {
        "list": "platform.invoice.view",
        "retrieve": "platform.invoice.view",
        "pdf": "platform.invoice.view",
    }

    @extend_schema(responses={(200, "application/pdf"): bytes})
    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        return _pdf_response(self.get_object())
