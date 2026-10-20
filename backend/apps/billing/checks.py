from django.conf import settings
from django.core.checks import Error, register


@register()
def payment_configuration_check(app_configs, **kwargs):
    errors = []
    provider = settings.PAYMENT_PROVIDER
    if provider == "mock" and not settings.PAYMENT_MOCK_ENABLED:
        errors.append(
            Error(
                "PAYMENT_PROVIDER is 'mock' but the mock provider is disabled.",
                hint="The mock provider is for development/tests only. Configure a real provider.",
                id="billing.E001",
            )
        )
    if settings.PAYMENT_MOCK_ENABLED and not settings.DEBUG and not getattr(settings, "TESTING", False):
        errors.append(
            Error(
                "PAYMENT_MOCK_ENABLED must not be set outside development and tests.",
                hint="Remove PAYMENT_MOCK_ENABLED from the environment.",
                id="billing.E002",
            )
        )
    if provider and provider != "mock" and not settings.PAYMENT_WEBHOOK_SECRET:
        errors.append(
            Error(
                f"PAYMENT_WEBHOOK_SECRET is required for the '{provider}' provider.",
                id="billing.E003",
            )
        )
    if provider == "razorpay" and not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        errors.append(Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required.", id="billing.E004"))
    return errors
