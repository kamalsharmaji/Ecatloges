import uuid
from datetime import timedelta

import django_filters
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.businesses.models import Business, BusinessMembership

from .models import Notification, NotificationCategory
from .preferences import preferences_for, update_preferences
from .serializers import (
    MarkAllReadResponseSerializer,
    MarkAllReadSerializer,
    NotificationSerializer,
    NotificationSummarySerializer,
    PreferenceSerializer,
    PreferenceUpdateSerializer,
)

CONTEXT_PARAM = OpenApiParameter(
    "context",
    str,
    description="`<business id>` = that business's notifications; `platform` = notifications not tied to a "
    "business (e.g. Support Admin alerts). Omit for everything.",
)


class NotificationFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=[("unread", "Unread"), ("read", "Read")], method="filter_status")
    category = django_filters.ChoiceFilter(choices=NotificationCategory.choices)
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Notification
        fields = ["status", "category"]

    def filter_status(self, queryset, name, value):
        return queryset.filter(read_at__isnull=value == "unread")


@extend_schema(parameters=[CONTEXT_PARAM])
class NotificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """The signed-in user's own notifications. Nobody can read or change anyone else's."""

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    filterset_class = NotificationFilter
    search_fields = ["title", "body"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        user = self.request.user
        # Notifications from businesses the user has left (or that were suspended) disappear.
        member_of = BusinessMembership.objects.filter(
            user=user, status=BusinessMembership.Status.ACTIVE, business__status=Business.Status.ACTIVE
        ).values("business_id")
        qs = Notification.objects.select_related("business").filter(
            Q(business__isnull=True) | Q(business_id__in=member_of), recipient=user
        )
        context = self.request.query_params.get("context")
        if context == "platform":
            qs = qs.filter(business__isnull=True)
        elif context:
            try:
                business_id = uuid.UUID(context)
            except ValueError:
                raise exceptions.ValidationError({"context": ["Use a business id or 'platform'."]}) from None
            # Platform announcements aren't tied to one business; show them in every business panel.
            qs = qs.filter(Q(business_id=business_id) | Q(business__isnull=True, category=NotificationCategory.ANNOUNCEMENT))
        return qs

    @extend_schema(responses=NotificationSummarySerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Unread badge + per-category counts for the stat cards and tabs."""
        qs = self.get_queryset().order_by()
        since = timezone.now() - timedelta(days=1)
        rows = {
            r["category"]: r
            for r in qs.values("category").annotate(
                total=Count("id"),
                unread=Count("id", filter=Q(read_at__isnull=True)),
                today=Count("id", filter=Q(created_at__gte=since)),
            )
        }
        categories = [
            {"category": c.value, "label": c.label, "total": rows.get(c.value, {}).get("total", 0),
             "unread": rows.get(c.value, {}).get("unread", 0), "today": rows.get(c.value, {}).get("today", 0)}
            for c in NotificationCategory
        ]
        data = {
            "total": sum(c["total"] for c in categories),
            "unread": sum(c["unread"] for c in categories),
            "categories": categories,
        }
        return Response(NotificationSummarySerializer(data).data)

    @extend_schema(request=None, responses=NotificationSerializer)
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at", "updated_at"])
        return Response(self.get_serializer(notification).data)

    @extend_schema(request=None, responses=NotificationSerializer)
    @action(detail=True, methods=["post"])
    def unread(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is not None:
            notification.read_at = None
            notification.save(update_fields=["read_at", "updated_at"])
        return Response(self.get_serializer(notification).data)

    @extend_schema(methods=["GET"], responses=PreferenceSerializer(many=True))
    @extend_schema(methods=["PATCH"], request=PreferenceUpdateSerializer, responses=PreferenceSerializer(many=True))
    @action(detail=False, methods=["get", "patch"])
    def preferences(self, request):
        """The caller's own notification preferences (there is no way to address another user's)."""
        if request.method == "PATCH":
            serializer = PreferenceUpdateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            update_preferences(request.user, serializer.validated_data["preferences"])
        return Response(PreferenceSerializer(preferences_for(request.user), many=True).data)

    @extend_schema(request=MarkAllReadSerializer, responses=MarkAllReadResponseSerializer)
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        serializer = MarkAllReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        qs = self.get_queryset().filter(read_at__isnull=True)
        if category := serializer.validated_data.get("category"):
            qs = qs.filter(category=category)
        now = timezone.now()
        updated = Notification.objects.filter(pk__in=qs.values("pk")).update(read_at=now, updated_at=now)
        return Response({"updated": updated}, status=status.HTTP_200_OK)
