"""Production settings. Every secret must come from the environment."""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import PAYMENT_PROVIDER, env

DEBUG = False

# The mock gateway can never be used in production: it would grant paid access without payment.
PAYMENT_MOCK_ENABLED = False
if PAYMENT_PROVIDER == "mock" or env.bool("PAYMENT_MOCK_ENABLED", default=False):
    raise ImproperlyConfigured(
        "The mock payment provider is not allowed in production. Set PAYMENT_PROVIDER to a real provider."
    )

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env.bool("DJANGO_SECURE_HSTS_PRELOAD", default=False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# Object storage (S3-compatible) is configured in Phase 6/15 via django-storages:
# set STORAGE_BACKEND=s3 and the AWS_* variables documented in docs/SETUP.md.
