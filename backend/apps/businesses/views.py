from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .context import BUSINESS_HEADER, resolve_business_context
from .mixins import BusinessScopedViewMixin
from .models import BusinessMembership, StaffInvitation
from .serializers import (
    AcceptInvitationSerializer,
    BusinessContextSerializer,
    BusinessSerializer,
    InvitationSerializer,
    MembershipSerializer,
    MyBusinessSerializer,
    TransferOwnershipSerializer,
)

BUSINESS_HEADER_PARAM = OpenApiParameter(
    BUSINESS_HEADER, str, OpenApiParameter.HEADER, required=True, description="UUID of the active business."
)


class BusinessListCreateView(generics.ListCreateAPIView):
    """
    GET: businesses the caller belongs to (with their role and membership status).
    POST: create a business; the caller becomes its owner.
    """

    def get_serializer_class(self):
        return BusinessSerializer if self.request.method == "POST" else MyBusinessSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BusinessMembership.objects.none()
        return (
            BusinessMembership.objects.filter(user=self.request.user)
            .select_related("business", "role")
            .order_by("business__name")
        )

    @extend_schema(request=BusinessSerializer, responses={201: BusinessSerializer})
    def post(self, request, *args, **kwargs):
        serializer = BusinessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = services.create_business(user=request.user, **serializer.validated_data)
        return Response(BusinessSerializer(business).data, status=status.HTTP_201_CREATED)


class BusinessDetailView(APIView):
    """Business profile, addressed by ID. Requires an active membership in that business."""

    serializer_class = BusinessSerializer

    def _context(self, request, business_id, permission):
        ctx = resolve_business_context(request.user, business_id)
        if not ctx.has(permission):
            self.permission_denied(request, message="You do not have permission to perform this action.")
        return ctx

    @extend_schema(responses=BusinessSerializer)
    def get(self, request, business_id):
        ctx = self._context(request, business_id, "business.view")
        return Response(BusinessSerializer(ctx.business).data)

    @extend_schema(request=BusinessSerializer, responses=BusinessSerializer)
    def patch(self, request, business_id):
        ctx = self._context(request, business_id, "business.update")
        serializer = BusinessSerializer(ctx.business, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class BusinessContextView(BusinessScopedViewMixin, APIView):
    """The active business, the caller's role in it, and their effective permissions."""

    required_permissions = {"get": ()}

    @extend_schema(responses=BusinessContextSerializer)
    def get(self, request):
        return Response(BusinessContextSerializer(request.business_context).data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class LeaveBusinessView(BusinessScopedViewMixin, APIView):
    required_permissions = {"post": ()}

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        services.leave_business(request.business_context)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class MembershipViewSet(
    BusinessScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = MembershipSerializer
    queryset = BusinessMembership.objects.select_related("user", "role")
    http_method_names = ["get", "patch", "delete", "post"]
    filterset_fields = ["status", "role"]
    search_fields = ["user__email", "user__full_name"]
    ordering_fields = ["created_at", "user__full_name"]
    required_permissions = {
        "list": "member.view",
        "retrieve": "member.view",
        "partial_update": "member.manage",
        "destroy": "member.manage",
        "transfer_ownership": "business.transfer_ownership",
    }

    def perform_update(self, serializer):
        data = serializer.validated_data
        updated = services.update_membership(
            self.request.business_context, serializer.instance, role=data.get("role"), status=data.get("status")
        )
        serializer.instance = updated

    def perform_destroy(self, instance):
        services.remove_membership(self.request.business_context, instance)

    @extend_schema(request=TransferOwnershipSerializer, responses=MembershipSerializer)
    @action(detail=False, methods=["post"], url_path="transfer-ownership")
    def transfer_ownership(self, request):
        serializer = TransferOwnershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = self.get_queryset().filter(pk=serializer.validated_data["membership_id"]).first()
        if target is None:
            raise NotFound("Member not found.")
        membership = services.transfer_ownership(request.business_context, target)
        return Response(MembershipSerializer(membership, context=self.get_serializer_context()).data)


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class InvitationViewSet(
    BusinessScopedViewMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = InvitationSerializer
    queryset = StaffInvitation.objects.select_related("role", "invited_by")
    filterset_fields = ["status"]
    required_permissions = {"list": "member.view", "create": "member.invite", "destroy": "member.invite"}

    def perform_create(self, serializer):
        data = serializer.validated_data
        serializer.instance = services.invite_member(
            self.request.business_context, email=data["email"], role=data["role"]
        )

    def perform_destroy(self, instance):
        services.revoke_invitation(instance)


class AcceptInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=AcceptInvitationSerializer, responses={201: MyBusinessSerializer})
    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = services.accept_invitation(user=request.user, token=serializer.validated_data["token"])
        return Response(MyBusinessSerializer(membership).data, status=status.HTTP_201_CREATED)
