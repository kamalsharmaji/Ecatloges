from django.conf import settings
from rest_framework import exceptions

from .base import PaymentProvider, ProviderError, ProviderEvent, ProviderOrder

__all__ = ["PaymentProvider", "ProviderError", "ProviderEvent", "ProviderOrder", "get_provider", "get_provider_by_name"]


class ProviderUnavailable(exceptions.APIException):
    status_code = 503
    default_detail = "Online payments are not configured yet. Please contact support."
    default_code = "payment_provider_unavailable"


def _registry() -> dict[str, type[PaymentProvider]]:
    from .mock import MockProvider
    from .razorpay import RazorpayProvider

    providers: dict[str, type[PaymentProvider]] = {"razorpay": RazorpayProvider}
    if settings.PAYMENT_MOCK_ENABLED:
        # The mock provider only exists in development and automated tests.
        providers["mock"] = MockProvider
    return providers


def get_provider_by_name(name: str) -> PaymentProvider:
    cls = _registry().get(name)
    if cls is None:
        raise ProviderUnavailable()
    return cls()


def get_provider() -> PaymentProvider:
    """The provider used for new checkouts (settings.PAYMENT_PROVIDER)."""
    if not settings.PAYMENT_PROVIDER:
        raise ProviderUnavailable()
    return get_provider_by_name(settings.PAYMENT_PROVIDER)
