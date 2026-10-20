"""Super Admin oversight APIs. Every endpoint requires a `platform.*` permission (Super Admin only)."""
import platform as py_platform
from datetime import timedelta

import django
import django_filters
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import PlatformRole
from apps.accounts.platform import HasPlatformPermission, platform_permissions
from apps.analytics.models import AnalyticsEvent, EventType
from apps.analytics.services import parse_range
from apps.audit_logs.models import AuditLog
from apps.billing.models import Payment, Subscription
from apps.businesses.models import Business, BusinessMembership
from apps.catalogues import qr
from apps.catalogues.models import Catalogue, CatalogueStatus
from apps.enquiries.models import Enquiry

from . import services
from .serializers import (
    AdminBusinessDetailSerializer,
    AdminBusinessSerializer,
    AdminCatalogueSerializer,
    AdminUserDetailSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    StatusChangeSerializer,
)

RANGE_PARAMS = [
    OpenApiParameter("from", OpenApiTypes.DATE), OpenApiParameter("to", OpenApiTypes.DATE),
    OpenApiParameter("tz", str, description="IANA timezone for day/month boundaries"),
]


class PlatformView:
    permission_classes = [IsAuthenticated, HasPlatformPermission]


def _events(**filters):
    return [
        {"id": e.id, "action": e.action, "actor_name": e.actor_name or ("System" if e.actor_type == "system" else ""),
         "target_label": e.target_label, "created_at": e.created_at}
        for e in AuditLog.objects.filter(**filters).order_by("-created_at")[:15]
    ]


# ---------------------------------------------------------------------------
# Dashboard & system status
# ---------------------------------------------------------------------------
class DashboardView(PlatformView, APIView):
    required_platform_permissions = {"get": "platform.dashboard.view"}

    @extend_schema(parameters=RANGE_PARAMS, responses=OpenApiTypes.OBJECT)
    def get(self, request):
        """Platform totals for the range (default: last 30 days). Revenue is per currency and excludes test payments."""
        start, end, tz = parse_range(request.query_params)
        return Response(services.dashboard(start, end, tz))


def system_status() -> dict:
    checks = []
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks.append({"key": "database", "label": "Database", "ok": True, "detail": connection.vendor})
    except Exception as exc:  # noqa: BLE001
        checks.append({"key": "database", "label": "Database", "ok": False, "detail": type(exc).__name__})
    try:
        pending = MigrationExecutor(connection).migration_plan(MigrationExecutor(connection).loader.graph.leaf_nodes())
        checks.append({"key": "migrations", "label": "Migrations", "ok": not pending, "detail": f"{len(pending)} pending"})
    except Exception:  # noqa: BLE001
        checks.append({"key": "migrations", "label": "Migrations", "ok": False, "detail": "could not be checked"})
    backend = settings.EMAIL_BACKEND.rsplit(".", 1)[-1]
    checks.append({"key": "email", "label": "Email delivery", "ok": backend not in ("DummyBackend",),
                   "detail": backend + (" (prints to the server log — no real delivery)" if backend == "EmailBackend" and "console" in settings.EMAIL_BACKEND else "")})
    checks.append({"key": "payments", "label": "Payment gateway", "ok": True,
                   "detail": f"{settings.PAYMENT_PROVIDER}{' (mock — no real money)' if settings.PAYMENT_MOCK_ENABLED else ''}"})
    return {
        "ok": all(c["ok"] for c in checks),
        "checks": checks,
        # Non-secret configuration only: no keys, passwords, hosts or tokens.
        "config": {
            "debug": settings.DEBUG,
            "time_zone": settings.TIME_ZONE,
            "frontend_url": settings.FRONTEND_URL,
            "billing_currency": settings.BILLING_CURRENCIES[0],
            "subscription_grace_days": settings.SUBSCRIPTION_GRACE_DAYS,
            "subscription_reminder_days": settings.SUBSCRIPTION_REMINDER_DAYS,
            "media_max_upload_mb": settings.MEDIA_MAX_UPLOAD_MB,
            "throttle_rates": settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}),
            "python": py_platform.python_version(),
            "django": django.get_version(),
        },
        "checked_at": timezone.now(),
    }


class SystemStatusView(PlatformView, APIView):
    required_platform_permissions = {"get": "platform.system.view"}

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        """Health checks and read-only, non-secret configuration."""
        return Response(system_status())


# ---------------------------------------------------------------------------
# Businesses
# ---------------------------------------------------------------------------
class BusinessFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=Business.Status.choices)
    category = django_filters.CharFilter()
    subscription = django_filters.ChoiceFilter(
        method="filter_subscription",
        choices=[("active", "Active"), ("past_due", "Past due"), ("expiring", "Expiring in 7 days"), ("none", "No current plan")],
    )
    plan = django_filters.CharFilter(method="filter_plan", label="Current plan name")
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Business
        fields = ["status", "category"]

    def filter_subscription(self, queryset, name, value):
        if value == "none":
            return queryset.filter(subscription_status__isnull=True)
        if value == "expiring":
            return queryset.filter(subscription_status=Subscription.Status.ACTIVE,
                                   subscription_ends_at__lte=timezone.now() + timedelta(days=services.EXPIRING_DAYS))
        return queryset.filter(subscription_status=value)

    def filter_plan(self, queryset, name, value):
        return queryset.filter(plan_name__iexact=value)


class AdminBusinessViewSet(PlatformView, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    filterset_class = BusinessFilter
    search_fields = ["name", "slug", "email", "phone", "owner_name", "city"]
    ordering_fields = ["created_at", "name", "product_count", "storage_bytes", "subscription_ends_at"]
    ordering = ["-created_at"]
    required_platform_permissions = {
        "list": "platform.business.view", "retrieve": "platform.business.view", "summary": "platform.business.view",
        "suspend": "platform.business.manage", "reactivate": "platform.business.manage",
    }

    def get_queryset(self):
        return services.annotated_businesses().select_related("logo")

    def get_serializer_class(self):
        return AdminBusinessDetailSerializer if self.action == "retrieve" else AdminBusinessSerializer

    def retrieve(self, request, pk=None):
        business = self.get_object()
        members = BusinessMembership.objects.filter(business=business).select_related("user", "role").order_by("created_at")
        business.detail_members = [
            {"id": m.id, "user_id": m.user_id, "name": m.user.full_name, "email": m.user.email, "role": m.role.name,
             "status": m.status, "is_owner": m.is_owner}
            for m in members
        ]
        business.detail_subscriptions = list(Subscription.objects.filter(business=business).order_by("-created_at")[:6])
        business.detail_payments = list(Payment.objects.filter(business=business).order_by("-created_at")[:6])
        business.detail_catalogues = [
            {"id": c.id, "name": c.name, "status": c.status, "public_url": c.public_url if c.status == CatalogueStatus.PUBLISHED else None}
            for c in Catalogue.objects.filter(business=business).select_related("business").order_by("-created_at")[:10]
        ]
        business.detail_activity = _events(business=business)
        return Response(AdminBusinessDetailSerializer(business).data)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = services.annotated_businesses()
        now = timezone.now()
        month_start = timezone.localtime(now).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return Response({
            **Business.objects.aggregate(
                total=Count("id"),
                active=Count("id", filter=Q(status=Business.Status.ACTIVE)),
                suspended=Count("id", filter=Q(status=Business.Status.SUSPENDED)),
                new_this_month=Count("id", filter=Q(created_at__gte=month_start)),
            ),
            "with_plan": qs.filter(subscription_status__isnull=False).count(),
            "expiring": qs.filter(subscription_status=Subscription.Status.ACTIVE,
                                  subscription_ends_at__lte=now + timedelta(days=services.EXPIRING_DAYS)).count(),
            "without_plan": qs.filter(subscription_status__isnull=True).count(),
            "plans": sorted({p for p in qs.exclude(plan_name__isnull=True).values_list("plan_name", flat=True)}),
        })

    def _status(self, request, status):
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.set_business_status(self.get_object(), status=status, reason=serializer.validated_data["reason"], actor=request.user)
        return self.retrieve(request, pk=self.kwargs["pk"])

    @extend_schema(request=StatusChangeSerializer, responses=AdminBusinessDetailSerializer)
    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        """Block access for the business's team and take its public catalogues offline. Reversible; nothing is deleted."""
        return self._status(request, Business.Status.SUSPENDED)

    @extend_schema(request=StatusChangeSerializer, responses=AdminBusinessDetailSerializer)
    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        return self._status(request, Business.Status.ACTIVE)


# ---------------------------------------------------------------------------
# Platform users
# ---------------------------------------------------------------------------
class UserFilter(django_filters.FilterSet):
    platform_role = django_filters.ChoiceFilter(choices=PlatformRole.choices, method="filter_role")
    is_active = django_filters.BooleanFilter()
    is_email_verified = django_filters.BooleanFilter()
    business = django_filters.UUIDFilter(field_name="memberships__business_id")

    class Meta:
        model = get_user_model()
        fields = ["is_active", "is_email_verified"]

    def filter_role(self, queryset, name, value):
        return queryset.filter(platform_role=value)


class AdminUserViewSet(PlatformView, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    filterset_class = UserFilter
    search_fields = ["email", "full_name", "phone"]
    ordering_fields = ["date_joined", "last_login", "full_name", "email"]
    ordering = ["-date_joined"]
    http_method_names = ["get", "patch"]
    required_platform_permissions = {
        "list": "platform.user.view", "retrieve": "platform.user.view", "summary": "platform.user.view",
        "partial_update": "platform.user.manage",
    }

    def get_queryset(self):
        return get_user_model().objects.annotate(
            membership_count=Count("memberships", filter=Q(memberships__status=BusinessMembership.Status.ACTIVE), distinct=True)
        ).distinct()

    def get_serializer_class(self):
        return AdminUserDetailSerializer if self.action == "retrieve" else AdminUserSerializer

    def _detail(self, user):
        # Business roles (per membership) and the platform role are reported separately on purpose.
        user.membership_list = [
            {"business_id": m.business_id, "business_name": m.business.name, "business_status": m.business.status,
             "role": m.role.name, "status": m.status, "joined_at": m.created_at}
            for m in BusinessMembership.objects.filter(user=user).select_related("business", "role").order_by("business__name")
        ]
        user.platform_permissions = sorted(platform_permissions(user))
        user.activity = _events(actor=user)
        return Response(AdminUserDetailSerializer(user).data)

    def retrieve(self, request, pk=None):
        return self._detail(self.get_object())

    @extend_schema(request=AdminUserUpdateSerializer, responses=AdminUserDetailSerializer)
    def partial_update(self, request, pk=None):
        """Activate/deactivate, or change the platform role. You can't change yourself or remove the last Super Admin."""
        serializer = AdminUserUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data:
            raise exceptions.ValidationError({"detail": ["Send is_active and/or platform_role."]})
        user = services.update_user(self.get_object(), actor=request.user, **serializer.validated_data)
        return self._detail(self.get_queryset().get(pk=user.pk))

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        month_start = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return Response(get_user_model().objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
            unverified=Count("id", filter=Q(is_email_verified=False)),
            super_admins=Count("id", filter=Q(platform_role=PlatformRole.SUPER_ADMIN)),
            support_admins=Count("id", filter=Q(platform_role=PlatformRole.SUPPORT_ADMIN)),
            new_this_month=Count("id", filter=Q(date_joined__gte=month_start)),
        ))


# ---------------------------------------------------------------------------
# Catalogues, QR
# ---------------------------------------------------------------------------
class CatalogueFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=CatalogueStatus.choices)
    business = django_filters.UUIDFilter(field_name="business_id")

    class Meta:
        model = Catalogue
        fields = ["status", "business"]


class AdminCatalogueViewSet(PlatformView, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AdminCatalogueSerializer
    filterset_class = CatalogueFilter
    search_fields = ["name", "slug", "business__name", "business__slug"]
    ordering_fields = ["created_at", "updated_at", "name", "product_count", "view_count"]
    ordering = ["-created_at"]
    required_platform_permissions = {
        "list": "platform.catalogue.view", "retrieve": "platform.catalogue.view", "summary": "platform.catalogue.view",
        "qr": "platform.catalogue.view", "unpublish": "platform.catalogue.manage",
    }

    def get_queryset(self):
        views = (
            AnalyticsEvent.objects.filter(catalogue=OuterRef("pk"), event_type=EventType.CATALOGUE_VIEW)
            .values("catalogue").annotate(n=Count("id")).values("n")
        )
        enquiries = Enquiry.objects.filter(catalogue=OuterRef("pk")).values("catalogue").annotate(n=Count("id")).values("n")
        return Catalogue.objects.select_related("business", "cover").annotate(
            product_count=Count("items", distinct=True),
            view_count=Coalesce(Subquery(views, output_field=IntegerField()), 0),
            enquiry_count=Coalesce(Subquery(enquiries, output_field=IntegerField()), 0),
        )

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        month_start = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        from apps.products.models import Product

        return Response({
            **Catalogue.objects.aggregate(
                total=Count("id"),
                published=Count("id", filter=Q(status=CatalogueStatus.PUBLISHED)),
                draft=Count("id", filter=Q(status=CatalogueStatus.DRAFT)),
                archived=Count("id", filter=Q(status=CatalogueStatus.ARCHIVED)),
                new_this_month=Count("id", filter=Q(created_at__gte=month_start)),
                live=Count("id", filter=Q(status=CatalogueStatus.PUBLISHED, business__status=Business.Status.ACTIVE)),
            ),
            "products": Product.objects.count(),
        })

    @extend_schema(parameters=[OpenApiParameter("type", str, enum=["png", "svg"])],
                   responses={(200, "image/png"): bytes, (200, "image/svg+xml"): bytes})
    @action(detail=True, methods=["get"])
    def qr(self, request, pk=None):
        """QR for the canonical public link — published catalogues only (same generator as the business panel)."""
        catalogue = self.get_object()
        if catalogue.status != CatalogueStatus.PUBLISHED:
            raise exceptions.NotFound("Only published catalogues have a public link.")
        fmt = request.query_params.get("type", "png")
        if fmt not in ("png", "svg"):
            raise exceptions.ValidationError({"type": ["Use png or svg."]})
        target = qr.qr_target(catalogue, tracking=request.query_params.get("tracking", "true").lower() != "false")
        if fmt == "svg":
            response = HttpResponse(qr.render_svg(target, color="#000000"), content_type="image/svg+xml")
        else:
            response = HttpResponse(qr.render_png(target, color="#000000", size=600), content_type="image/png")
        response["Content-Disposition"] = f'attachment; filename="{catalogue.business.slug}-{catalogue.slug}-qr.{fmt}"'
        return response

    @extend_schema(request=StatusChangeSerializer, responses=AdminCatalogueSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        """Moderation takedown: the catalogue goes back to draft (content kept) and the business is notified."""
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.unpublish_catalogue(self.get_object(), reason=serializer.validated_data["reason"], actor=request.user)
        return Response(AdminCatalogueSerializer(self.get_queryset().get(pk=pk)).data)
