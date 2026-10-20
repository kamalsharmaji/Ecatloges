import django_filters
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.platform import HasPlatformPermission
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM

from .models import AuditLog, AuditScope
from .serializers import ActivityFiltersSerializer, AuditLogSerializer, PlatformAuditLogSerializer


class AuditLogFilter(django_filters.FilterSet):
    action = django_filters.CharFilter()
    module = django_filters.CharFilter()
    actor = django_filters.UUIDFilter(field_name="actor_id")
    actor_type = django_filters.CharFilter()
    target_type = django_filters.CharFilter()
    target_id = django_filters.CharFilter()
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = AuditLog
        fields = ["action", "module", "actor", "actor_type", "target_type", "target_id"]


class PlatformAuditLogFilter(AuditLogFilter):
    business = django_filters.UUIDFilter(field_name="business_id")
    scope = django_filters.ChoiceFilter(choices=AuditScope.choices)

    class Meta(AuditLogFilter.Meta):
        fields = [*AuditLogFilter.Meta.fields, "business", "scope"]


def _filter_options(qs) -> dict:
    qs = qs.order_by()
    actors = dict(qs.exclude(actor__isnull=True).values_list("actor_id", "actor_name").distinct()[:500])
    return {
        "modules": sorted(set(qs.values_list("module", flat=True).distinct())),
        "actions": sorted(set(qs.values_list("action", flat=True).distinct())),
        "actors": sorted(({"id": a, "name": n} for a, n in actors.items()), key=lambda a: a["name"].lower()),
    }


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class ActivityLogViewSet(BusinessScopedViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Business Activity Log: read-only, this business's entries only."""

    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("actor").filter(scope=AuditScope.BUSINESS)
    filterset_class = AuditLogFilter
    search_fields = ["action", "target_label", "actor_name"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at", "-id"]
    required_permissions = {"list": "audit_log.view", "retrieve": "audit_log.view", "filters": "audit_log.view"}

    @extend_schema(responses=ActivityFiltersSerializer)
    @action(detail=False, methods=["get"])
    def filters(self, request):
        """Values for the action/module/actor dropdowns (only ones that occur in this business)."""
        qs = self.get_queryset()
        options = _filter_options(qs)
        # Platform staff appear as "myEcatalogues team" in the list; don't reveal them here either.
        options["actors"] = _filter_options(qs.filter(actor_type="user"))["actors"]
        return Response(ActivityFiltersSerializer(options).data)


class PlatformAuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Platform-wide audit trail (all scopes) for Super Admins."""

    permission_classes = [IsAuthenticated, HasPlatformPermission]
    serializer_class = PlatformAuditLogSerializer
    queryset = AuditLog.objects.select_related("actor", "business")
    filterset_class = PlatformAuditLogFilter
    search_fields = ["action", "target_label", "actor_name", "business__name", "request_id"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at", "-id"]
    required_platform_permissions = {
        "list": "platform.audit_log.view",
        "retrieve": "platform.audit_log.view",
        "filters": "platform.audit_log.view",
    }

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "platform": True}

    @extend_schema(responses=ActivityFiltersSerializer)
    @action(detail=False, methods=["get"])
    def filters(self, request):
        return Response(ActivityFiltersSerializer(_filter_options(self.get_queryset())).data)
