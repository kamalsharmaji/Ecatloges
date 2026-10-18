from rest_framework.permissions import IsAuthenticated

from .permissions import HasBusinessPermission


class BusinessScopedViewMixin:
    """
    Base for every tenant-owned resource endpoint.

    - Requires authentication and an active membership in the X-Business-ID business.
    - Restricts querysets to that business, so other tenants' rows are simply invisible (404).
    - Injects the business on create; clients can never choose it.
    """

    permission_classes = [IsAuthenticated, HasBusinessPermission]
    required_permissions: dict = {}
    business_field = "business"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # OpenAPI schema generation
            return super().get_queryset().none()
        return super().get_queryset().filter(**{self.business_field: self.request.business})

    def perform_create(self, serializer):
        serializer.save(**{self.business_field: self.request.business})

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["business"] = getattr(self.request, "business", None)
        context["business_context"] = getattr(self.request, "business_context", None)
        return context
