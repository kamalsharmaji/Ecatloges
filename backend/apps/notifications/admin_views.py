"""Announcement feed (everyone) and Super Admin management of announcements and email templates."""
import django_filters
from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.platform import HasPlatformPermission
from apps.audit_logs import services as audit
from apps.businesses.models import Business
from apps.core.emails import send_plain_email

from . import announcements as svc
from .email_templates import REGISTRY, TemplateError, active_source, render, validate
from .models import Announcement, AnnouncementStatus, EmailTemplate
from .serializers import (
    AnnouncementFeedSerializer,
    AnnouncementSerializer,
    AudienceCountResponseSerializer,
    AudienceCountSerializer,
    BusinessOptionSerializer,
    EmailPreviewSerializer,
    EmailTemplateDraftSerializer,
    EmailTemplateSerializer,
    EmailTemplateUpdateSerializer,
)

ANNOUNCEMENT_MANAGE = "platform.announcement.manage"
TEMPLATE_MANAGE = "platform.email_template.manage"


class AnnouncementFeedView(generics.ListAPIView):
    """Live announcements addressed to the signed-in user (drafts and other audiences never appear)."""

    permission_classes = [IsAuthenticated]
    serializer_class = AnnouncementFeedSerializer
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Announcement.objects.none()
        return svc.feed_for(self.request.user)[:10]


# ---------------------------------------------------------------------------
# Announcements (Super Admin)
# ---------------------------------------------------------------------------
class AnnouncementFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=AnnouncementStatus.choices)

    class Meta:
        model = Announcement
        fields = ["status", "audience", "level"]


class AdminAnnouncementViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    serializer_class = AnnouncementSerializer
    queryset = Announcement.objects.select_related("created_by").prefetch_related("businesses")
    filterset_class = AnnouncementFilter
    search_fields = ["title", "body"]
    ordering_fields = ["created_at", "published_at", "starts_at"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "patch"]
    required_platform_permissions = {
        a: ANNOUNCEMENT_MANAGE for a in (
            "list", "retrieve", "create", "partial_update", "publish", "unpublish", "archive",
            "audience_count", "business_options", "recipients",
        )
    }

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save(created_by=self.request.user, updated_by=self.request.user)
            audit.record_platform(self.request.user, "announcement.created", target=serializer.instance,
                                  metadata={"audience": serializer.instance.audience})

    def perform_update(self, serializer):
        if serializer.instance.status == AnnouncementStatus.ARCHIVED:
            raise exceptions.ValidationError({"status": ["Archived announcements can't be edited."]})
        with transaction.atomic():
            serializer.save(updated_by=self.request.user)
            audit.record_platform(self.request.user, "announcement.updated", target=serializer.instance,
                                  metadata={"fields": sorted(serializer.validated_data)})

    def _respond(self, announcement):
        return Response(AnnouncementSerializer(self.get_queryset().get(pk=announcement.pk)).data)

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Publish now, or schedule if `starts_at` is in the future. Delivery happens once."""
        return self._respond(svc.publish(self.get_object(), actor=request.user))

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        return self._respond(svc.set_status(self.get_object(), AnnouncementStatus.UNPUBLISHED, actor=request.user))

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._respond(svc.set_status(self.get_object(), AnnouncementStatus.ARCHIVED, actor=request.user))

    @extend_schema(responses=AudienceCountResponseSerializer)
    @action(detail=True, methods=["get"])
    def recipients(self, request, pk=None):
        """How many people this announcement would reach right now."""
        return Response({"recipients": svc.recipients_of(self.get_object()).count()})

    @extend_schema(request=AudienceCountSerializer, responses=AudienceCountResponseSerializer)
    @action(detail=False, methods=["post"], url_path="audience-count")
    def audience_count(self, request):
        serializer = AudienceCountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return Response({"recipients": svc.audience_users(data["audience"], data.get("business_ids", [])).count()})

    @extend_schema(parameters=[OpenApiParameter("search", str)], responses=BusinessOptionSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="business-options")
    def business_options(self, request):
        """Active businesses for the "selected businesses" audience picker (name/slug search, max 20)."""
        term = request.query_params.get("search", "").strip()
        qs = Business.objects.filter(status=Business.Status.ACTIVE).order_by("name")
        if term:
            qs = qs.filter(name__icontains=term) | qs.filter(slug__icontains=term)
        return Response(BusinessOptionSerializer(qs[:20], many=True).data)


# ---------------------------------------------------------------------------
# Email templates (Super Admin)
# ---------------------------------------------------------------------------
def _template_data(key: str) -> dict:
    definition = REGISTRY[key]
    stored = EmailTemplate.objects.select_related("updated_by").filter(key=key).first()
    return {
        "key": key,
        "name": definition.name,
        "description": definition.description,
        "group": definition.group,
        "mandatory": definition.mandatory,
        "variables": [
            {"name": n, "description": d, "required": n in definition.required, "sample": definition.sample.get(n, "")}
            for n, d in definition.variables.items()
        ],
        "subject": stored.subject if stored else definition.subject,
        "body": stored.body if stored else definition.body,
        "default_subject": definition.subject,
        "default_body": definition.body,
        "is_custom": stored is not None,
        "is_active": bool(stored and stored.is_active),
        "updated_at": stored.updated_at if stored else None,
        "updated_by_name": (stored.updated_by.full_name if stored and stored.updated_by else ""),
    }


def _definition(key):
    if key not in REGISTRY:
        raise exceptions.NotFound("Unknown email template.")
    return REGISTRY[key]


class AdminEmailTemplateViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    lookup_value_regex = r"[a-z_.]+"
    required_platform_permissions = {a: TEMPLATE_MANAGE for a in ("list", "retrieve", "update", "destroy", "preview", "test")}

    def get_throttles(self):
        # Test emails really go out: keep them rare.
        if self.action == "test":
            self.throttle_scope = "auth"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @extend_schema(responses=EmailTemplateSerializer(many=True))
    def list(self, request):
        return Response(EmailTemplateSerializer([_template_data(k) for k in REGISTRY], many=True).data)

    @extend_schema(responses=EmailTemplateSerializer)
    def retrieve(self, request, pk=None):
        _definition(pk)
        return Response(EmailTemplateSerializer(_template_data(pk)).data)

    @extend_schema(request=EmailTemplateUpdateSerializer, responses=EmailTemplateSerializer)
    def update(self, request, pk=None):
        """Save an override. Only {{ allowlisted_variable }} placeholders are accepted."""
        definition = _definition(pk)
        serializer = EmailTemplateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            validate(definition, data["subject"], data["body"])
        except TemplateError as exc:
            raise exceptions.ValidationError(exc.errors) from None
        with transaction.atomic():
            stored = EmailTemplate.objects.select_for_update().filter(key=pk).first()
            before = {"subject": stored.subject, "body": stored.body, "is_active": stored.is_active} if stored else {}
            stored, _ = EmailTemplate.objects.update_or_create(
                key=pk, defaults={**data, "updated_by": request.user}
            )
            changes = {k: {"from": before.get(k), "to": v} for k, v in data.items() if before.get(k) != v}
            # Subject/body text is stored as "changed" only (the redactor hides body); is_active is shown.
            audit.record_platform(request.user, "email_template.updated", target_type="emailtemplate",
                                  target_id=pk, target_label=definition.name, changes=changes)
        return Response(EmailTemplateSerializer(_template_data(pk)).data)

    @extend_schema(responses={204: None})
    def destroy(self, request, pk=None):
        """Reset to the built-in default (deletes the override)."""
        definition = _definition(pk)
        with transaction.atomic():
            deleted, _ = EmailTemplate.objects.filter(key=pk).delete()
            if deleted:
                audit.record_platform(request.user, "email_template.reset", target_type="emailtemplate",
                                      target_id=pk, target_label=definition.name)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=EmailTemplateDraftSerializer, responses=EmailPreviewSerializer)
    @action(detail=True, methods=["post"])
    def preview(self, request, pk=None):
        """Render a draft (or the current version) with sample data. Never sends anything."""
        definition = _definition(pk)
        subject, body = self._draft(pk, request.data)
        errors = {}
        try:
            validate(definition, subject, body)
        except TemplateError as exc:
            errors = exc.errors
        rendered_subject, rendered_body = render(definition, subject, body, definition.sample)
        return Response({"subject": rendered_subject, "body": rendered_body, "errors": errors})

    @extend_schema(request=EmailTemplateDraftSerializer, responses={202: None})
    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        """Send the (draft) template with sample data to the requesting admin's own address only."""
        definition = _definition(pk)
        subject, body = self._draft(pk, request.data)
        try:
            validate(definition, subject, body)
        except TemplateError as exc:
            raise exceptions.ValidationError(exc.errors) from None
        rendered_subject, rendered_body = render(definition, subject, body, definition.sample)
        sent = send_plain_email(to=request.user.email, subject=f"[Test] {rendered_subject}", body=rendered_body, tag=f"test:{pk}")
        audit.record_platform(request.user, "email_template.test_sent", target_type="emailtemplate",
                              target_id=pk, target_label=definition.name, metadata={"delivered": sent})
        if not sent:
            raise exceptions.APIException("The test email could not be sent. Check the email settings.")
        return Response({"sent_to": request.user.email}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _draft(key, data):
        serializer = EmailTemplateDraftSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        current_subject, current_body, _ = active_source(key)
        return serializer.validated_data.get("subject", current_subject), serializer.validated_data.get("body", current_body)
