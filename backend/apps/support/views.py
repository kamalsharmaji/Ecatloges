import re

import django_filters
from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import PlatformRole
from apps.accounts.platform import HasPlatformPermission
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM

from . import services
from .models import SupportTicket, TicketCategory, TicketMessage, TicketPriority, TicketStatus
from .serializers import (
    AdminTicketDetailSerializer,
    AdminTicketSerializer,
    AdminTicketUpdateSerializer,
    ReplySerializer,
    StaffBriefSerializer,
    StaffReplySerializer,
    StatusSerializer,
    TicketCreateSerializer,
    TicketDetailSerializer,
    TicketSerializer,
    TicketSummarySerializer,
)

REFERENCE = re.compile(r"^\s*(?:tkt-?)?(\d{3,9})\s*$", re.IGNORECASE)


class TicketFilter(django_filters.FilterSet):
    status = django_filters.MultipleChoiceFilter(choices=TicketStatus.choices)
    category = django_filters.ChoiceFilter(choices=TicketCategory.choices)
    priority = django_filters.ChoiceFilter(choices=TicketPriority.choices)
    mine = django_filters.BooleanFilter(method="filter_mine", label="Only tickets I created")
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = SupportTicket
        fields = ["status", "category", "priority"]

    def filter_mine(self, queryset, name, value):
        return queryset.filter(created_by=self.request.user) if value else queryset


class AdminTicketFilter(TicketFilter):
    business = django_filters.UUIDFilter(field_name="business_id")
    assigned = django_filters.CharFilter(method="filter_assigned", label="`me`, `none` or a staff user id")

    class Meta(TicketFilter.Meta):
        fields = [*TicketFilter.Meta.fields, "business"]

    def filter_assigned(self, queryset, name, value):
        if value == "me":
            return queryset.filter(assigned_to=self.request.user)
        if value == "none":
            return queryset.filter(assigned_to__isnull=True)
        return queryset.filter(assigned_to_id=value)


def _search(queryset, term: str, fields: list[str]):
    if not term:
        return queryset
    q = Q()
    for field in fields:
        q |= Q(**{f"{field}__icontains": term})
    if match := REFERENCE.match(term):
        q |= Q(number=int(match.group(1)))
    return queryset.filter(q)


def _summary(queryset) -> dict:
    qs = queryset.order_by()
    by_status = dict(qs.values_list("status").annotate(n=Count("id")))
    by_category = dict(qs.values_list("category").annotate(n=Count("id")))
    return {
        "total": sum(by_status.values()),
        "statuses": [{"key": s.value, "label": s.label, "count": by_status.get(s.value, 0)} for s in TicketStatus],
        "categories": [{"key": c.value, "label": c.label, "count": by_category.get(c.value, 0)} for c in TicketCategory],
        "unassigned": qs.filter(assigned_to__isnull=True).exclude(status__in=[TicketStatus.RESOLVED, TicketStatus.CLOSED]).count(),
    }


_MESSAGES = Prefetch("messages", queryset=TicketMessage.objects.order_by("created_at"))


# ---------------------------------------------------------------------------
# Business side: Help & Support
# ---------------------------------------------------------------------------
@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class TicketViewSet(BusinessScopedViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Members with `support.view` see all of their business's tickets; everyone else sees only
    tickets they created. Internal notes and staff identities are never returned here.
    """

    queryset = SupportTicket.objects.select_related("created_by").annotate(
        message_count=Count("messages", filter=Q(messages__is_internal=False, messages__kind="message"))
    )
    filterset_class = TicketFilter
    ordering_fields = ["last_activity_at", "created_at", "priority", "status"]
    ordering = ["-last_activity_at"]
    # () = any active member; visibility is narrowed in get_queryset.
    required_permissions = {
        "list": (), "retrieve": (), "summary": (), "reply": (), "set_status": (),
        "create": "support.create",
    }

    def get_serializer_class(self):
        return TicketDetailSerializer if self.action == "retrieve" else TicketSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self, "swagger_fake_view", False):
            return qs
        if not self.request.business_context.has("support.view"):
            qs = qs.filter(created_by=self.request.user)
        if self.action == "retrieve":
            qs = qs.prefetch_related(_MESSAGES)
        return _search(qs, self.request.query_params.get("search", "").strip(), ["subject"])

    def _can_act(self, ticket) -> None:
        ctx = self.request.business_context
        if ticket.created_by_id != self.request.user.pk and not ctx.has("support.view", "support.create"):
            raise exceptions.PermissionDenied("Only the person who opened this ticket can update it.")

    def _detail(self, ticket, code=status.HTTP_200_OK):
        ticket = self.get_queryset().prefetch_related(_MESSAGES).get(pk=ticket.pk)
        return Response(TicketDetailSerializer(ticket, context=self.get_serializer_context()).data, status=code)

    @extend_schema(request=TicketCreateSerializer, responses={201: TicketDetailSerializer, 200: TicketDetailSerializer})
    def create(self, request):
        serializer = TicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket, created = services.create_ticket(user=request.user, business=request.business, **serializer.validated_data)
        if ticket.business_id != request.business.pk:  # client_key reused across businesses
            raise exceptions.ValidationError({"client_key": ["This key was already used."]})
        return self._detail(ticket, status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(request=ReplySerializer, responses=TicketDetailSerializer)
    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        ticket = self.get_object()
        self._can_act(ticket)
        serializer = ReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.requester_reply(ticket, user=request.user, body=serializer.validated_data["body"])
        return self._detail(ticket)

    @extend_schema(request=StatusSerializer, responses=TicketDetailSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        """Requesters may close a ticket, or reopen a resolved one."""
        ticket = self.get_object()
        self._can_act(ticket)
        serializer = StatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_status(ticket, user=request.user, status=serializer.validated_data["status"], staff=False)
        return self._detail(ticket)

    @extend_schema(responses=TicketSummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response(TicketSummarySerializer(_summary(self.get_queryset())).data)


# ---------------------------------------------------------------------------
# Platform side: Support Admin
# ---------------------------------------------------------------------------
class AdminTicketViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    queryset = SupportTicket.objects.select_related("created_by", "business", "assigned_to").annotate(
        message_count=Count("messages", filter=Q(messages__kind="message"))
    )
    filterset_class = AdminTicketFilter
    ordering_fields = ["last_activity_at", "created_at", "priority", "status", "number"]
    ordering = ["-last_activity_at"]
    required_platform_permissions = {
        "list": "platform.support.view",
        "retrieve": "platform.support.view",
        "summary": "platform.support.view",
        "agents": "platform.support.view",
        "partial_update": "platform.support.manage",
        "reply": "platform.support.manage",
        "set_status": "platform.support.manage",
    }
    http_method_names = ["get", "post", "patch"]

    def get_serializer_class(self):
        return AdminTicketDetailSerializer if self.action == "retrieve" else AdminTicketSerializer

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "platform": True}

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "retrieve":
            qs = qs.prefetch_related(_MESSAGES)
        return _search(
            qs, self.request.query_params.get("search", "").strip(),
            ["subject", "business__name", "created_by__email", "created_by__full_name"],
        )

    def _detail(self, ticket):
        ticket = self.get_queryset().prefetch_related(_MESSAGES).get(pk=ticket.pk)
        return Response(AdminTicketDetailSerializer(ticket, context=self.get_serializer_context()).data)

    @extend_schema(request=AdminTicketUpdateSerializer, responses=AdminTicketDetailSerializer)
    def partial_update(self, request, pk=None):
        """Assign (staff only), change priority or category."""
        ticket = self.get_object()
        serializer = AdminTicketUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        services.update_ticket(
            ticket, user=request.user, assigned_to=data.get("assigned_to", ...),
            priority=data.get("priority"), category=data.get("category"),
        )
        return self._detail(ticket)

    @extend_schema(request=StaffReplySerializer, responses=AdminTicketDetailSerializer)
    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        """Public reply (emailed to the requester) or internal note (`internal: true`)."""
        ticket = self.get_object()
        serializer = StaffReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        services.staff_reply(ticket, user=request.user, body=data["body"], internal=data["internal"], status=data.get("status"))
        return self._detail(ticket)

    @extend_schema(request=StatusSerializer, responses=AdminTicketDetailSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        ticket = self.get_object()
        serializer = StatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_status(ticket, user=request.user, status=serializer.validated_data["status"], staff=True)
        return self._detail(ticket)

    @extend_schema(responses=TicketSummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response(TicketSummarySerializer(_summary(self.filter_queryset(self.get_queryset()))).data)

    @extend_schema(responses=StaffBriefSerializer(many=True))
    @action(detail=False, methods=["get"])
    def agents(self, request):
        """Support staff that tickets can be assigned to."""
        users = get_user_model().objects.filter(
            is_active=True, platform_role__in=[PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT_ADMIN]
        ).order_by("full_name")
        return Response(StaffBriefSerializer(
            [{"id": u.pk, "name": u.full_name or u.email, "email": u.email} for u in users], many=True
        ).data)
