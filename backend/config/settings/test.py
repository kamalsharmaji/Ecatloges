"""Settings for the automated test suite."""
import tempfile

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
SECRET_KEY = "test-secret-key-not-for-production"  # noqa: S105
SIMPLE_JWT["SIGNING_KEY"] = SECRET_KEY  # noqa: F405

DATABASES = {  # noqa: F405
    "default": env.db(
        "TEST_DATABASE_URL",
        default=env(
            "DATABASE_URL",
            default="postgres://myecatalogues:myecatalogues@localhost:5432/myecatalogues",
        ),
    )
}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
MEDIA_ROOT = tempfile.mkdtemp(prefix="myecatalogues-test-media-")
PAYMENT_PROVIDER = "mock"
PAYMENT_WEBHOOK_SECRET = "test-webhook-secret"  # noqa: S105
LOGGING["root"]["level"] = "WARNING"  # noqa: F405

# Throttling is exercised by dedicated tests; keep generous defaults otherwise.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    key: "10000/min" for key in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]  # noqa: F405
}
