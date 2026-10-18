"""
Tenant context resolution.

Every business-scoped request names its business in the `X-Business-ID` header. The header is
only a *selector*: access is granted solely when the authenticated user has an ACTIVE membership
in an ACTIVE business. Anything else is indistinguishable from "does not exist" (404), so one
tenant can never probe for another tenant's records.
"""
import uuid
from dataclasses import dataclass

from rest_framework import exceptions

from .models import Business, BusinessMembership

BUSINESS_HEADER = "X-Business-ID"


class BusinessHeaderError(exceptions.APIException):
    status_code = 400
    default_detail = f"The {BUSINESS_HEADER} header is required for this endpoint."
    default_code = "business_header_required"


class BusinessSuspended(exceptions.PermissionDenied):
    default_detail = "This business has been suspended. Contact support."
    default_code = "business_suspended"


@dataclass(frozen=True)
class BusinessContext:
    business: Business
    membership: BusinessMembership
    permissions: frozenset[str]

    def has(self, *codes: str) -> bool:
        return all(code in self.permissions for code in codes)

    @property
    def is_owner(self) -> bool:
        return self.membership.is_owner


def parse_business_id(raw: str | None) -> uuid.UUID:
    if not raw:
        raise BusinessHeaderError()
    try:
        return uuid.UUID(str(raw).strip())
    except ValueError:
        raise BusinessHeaderError(
            f"The {BUSINESS_HEADER} header must be a valid business ID.", code="invalid_business_header"
        ) from None


def resolve_business_context(user, business_id) -> BusinessContext:
    """Return the caller's context for `business_id` or raise NotFound / BusinessSuspended."""
    if not user or not user.is_authenticated:
        raise exceptions.NotAuthenticated()
    membership = (
        BusinessMembership.objects.select_related("business", "role")
        .prefetch_related("role__permissions")
        .filter(business_id=business_id, user=user, status=BusinessMembership.Status.ACTIVE)
        .first()
    )
    if membership is None:
        raise exceptions.NotFound("Business not found.")
    if membership.business.status != Business.Status.ACTIVE:
        raise BusinessSuspended()
    return BusinessContext(
        business=membership.business,
        membership=membership,
        permissions=membership.role.permission_codes(),
    )


def get_request_context(request) -> BusinessContext:
    """Resolve (once per request) the business context from the X-Business-ID header."""
    cached = getattr(request, "_business_context", None)
    if cached is not None:
        return cached
    business_id = parse_business_id(request.headers.get(BUSINESS_HEADER))
    context = resolve_business_context(request.user, business_id)
    request._business_context = context
    return context
