"""Local development settings."""
from .base import *  # noqa: F401,F403
from .base import env

DEBUG = env.bool("DJANGO_DEBUG", default=True)

# Local development uses the mock gateway (no real money) unless a real provider is configured.
PAYMENT_MOCK_ENABLED = True
PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", default="mock")
PAYMENT_WEBHOOK_SECRET = env("PAYMENT_WEBHOOK_SECRET", default="") or "dev-only-mock-webhook-secret"
LOGGING["handlers"]["stdout"]["formatter"] = env("LOG_FORMAT", default="console")  # noqa: F405

# Browsable API is handy locally; production serves JSON only.
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = (  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
)
