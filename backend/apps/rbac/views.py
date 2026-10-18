from django.db.models import Count, Q
from rest_framework import generics, status, viewsets
from rest_framework.response import Response

from apps.businesses.mixins import BusinessScopedViewMixin

from . import services
from .models import Permission, Role
from .serializers import PermissionSerializer, RoleSerializer


class PermissionListView(generics.ListAPIView):
    """Catalogue of business permissions that can be placed in custom roles."""

    serializer_class = PermissionSerializer
    queryset = Permission.objects.filter(assignable=True)
    pagination_class = None


class RoleViewSet(BusinessScopedViewMixin, viewsets.ModelViewSet):
    """System roles (shared, read-only) plus this business's custom roles."""

    serializer_class = RoleSerializer
    http_method_names = ["get", "post", "patch", "delete"]
    pagination_class = None
    required_permissions = {
        "list": "role.view",
        "retrieve": "role.view",
        "create": "role.manage",
        "partial_update": "role.manage",
        "destroy": "role.manage",
    }

    def get_queryset(self):
        # Overrides the mixin: system roles have business=NULL and are visible to every tenant.
        if getattr(self, "swagger_fake_view", False):
            return Role.objects.none()
        return (
            Role.objects.filter(Q(business__isnull=True) | Q(business=self.request.business))
            .prefetch_related("permissions")
            .annotate(member_count=Count("memberships", filter=Q(memberships__business=self.request.business)))
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = services.create_role(request.business_context, **serializer.validated_data)
        return Response(self.get_serializer(self.get_queryset().get(pk=role.pk)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        role = self.get_object()
        serializer = self.get_serializer(role, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        services.update_role(request.business_context, role, **serializer.validated_data)
        return Response(self.get_serializer(self.get_queryset().get(pk=role.pk)).data)

    def destroy(self, request, *args, **kwargs):
        services.delete_role(request.business_context, self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)
