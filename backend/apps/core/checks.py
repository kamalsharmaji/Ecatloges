from django.conf import settings
from django.core.checks import Error, register


@register()
def jwt_signing_key_check(app_configs, **kwargs):
    """Refuse to start with an empty JWT signing key (tokens would fail to sign at runtime)."""
    if not settings.SIMPLE_JWT.get("SIGNING_KEY"):
        return [
            Error(
                "SIMPLE_JWT['SIGNING_KEY'] is empty.",
                hint="Set JWT_SIGNING_KEY or DJANGO_SECRET_KEY in the environment.",
                id="core.E001",
            )
        ]
    return []
