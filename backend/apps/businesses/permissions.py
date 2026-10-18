from rest_framework.permissions import BasePermission

from .context import get_request_context


class HasBusinessPermission(BasePermission):
    """
    Resolves the X-Business-ID tenant context and checks the view's required permissions.

    Views declare `required_permissions = {"list": "member.view", "create": ("member.invite",), ...}`
    keyed by viewset action (or lower-case HTTP method for APIViews). A missing key denies access,
    so new actions are closed by default.
    """

    message = "You do not have permission to perform this action in this business."

    def has_permission(self, request, view):
        context = get_request_context(request)
        request.business = context.business
        request.membership = context.membership
        request.business_context = context

        action = getattr(view, "action", None) or request.method.lower()
        required = getattr(view, "required_permissions", {}).get(action)
        if required is None:
            return False
        if isinstance(required, str):
            required = (required,)
        return context.has(*required)
