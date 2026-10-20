"""
Base settings shared by every environment.

All secrets and environment-specific values come from environment variables
(loaded from backend/.env in development). See backend/.env.example.
"""
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.rbac",
    "apps.businesses",
    "apps.billing",
    "apps.media_library",
    "apps.products",
    "apps.catalogues",
    "apps.enquiries",
    "apps.analytics",
    "apps.audit_logs",
    "apps.notifications",
    "apps.support",
    "apps.platform_admin",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.RequestIdMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://myecatalogues:myecatalogues@localhost:5432/myecatalogues",
    )
}
DATABASES["default"]["ATOMIC_REQUESTS"] = False
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DATABASE_CONN_MAX_AGE", default=60)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

# Lifetimes of links sent by email.
PASSWORD_RESET_TIMEOUT = env.int("PASSWORD_RESET_TIMEOUT", default=60 * 60)  # 1 hour
EMAIL_VERIFICATION_TIMEOUT = env.int("EMAIL_VERIFICATION_TIMEOUT", default=60 * 60 * 48)  # 48 hours

# Upper bound on businesses one user may own (plan-based limits arrive in Phase 4).
MAX_BUSINESSES_PER_USER = env.int("MAX_BUSINESSES_PER_USER", default=5)

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = env("DJANGO_TIME_ZONE", default="UTC")
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static & media files
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = env("MEDIA_URL", default="/media/")
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# Uploads larger than this are streamed to a temp file instead of held in memory,
# so large videos never get loaded fully into backend memory.
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
# Technical safety caps (independent of plan limits, which are usually stricter).
MEDIA_MAX_UPLOAD_MB = env.int("MEDIA_MAX_UPLOAD_MB", default=100)
MEDIA_MAX_ITEMS_PER_PRODUCT = env.int("MEDIA_MAX_ITEMS_PER_PRODUCT", default=20)
MEDIA_MAX_IMAGE_PIXELS = env.int("MEDIA_MAX_IMAGE_PIXELS", default=60_000_000)  # decompression-bomb guard
MEDIA_THUMBNAIL_SIZE = 480
MEDIA_PREVIEW_SIZE = 1600
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_PERMISSIONS = 0o644

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", default="120/min"),
        "user": env("THROTTLE_USER", default="600/min"),
        # Scoped rates for sensitive endpoints (used via ScopedRateThrottle).
        "auth": env("THROTTLE_AUTH", default="10/min"),
        "public_enquiry": env("THROTTLE_PUBLIC_ENQUIRY", default="5/min"),
        "public_view": env("THROTTLE_PUBLIC_VIEW", default="120/min"),
        "webhook": env("THROTTLE_WEBHOOK", default="120/min"),
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_DAYS", default=7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    # A blank JWT_SIGNING_KEY (as shipped in .env.example) falls back to the Django secret key.
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default="") or SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "myEcatalogues API",
    "DESCRIPTION": "Multi-tenant digital catalogue SaaS platform API.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "ENUM_NAME_OVERRIDES": {
        # Business.Status and BusinessMembership.Status share the same choices (active/suspended).
        "ActiveStatusEnum": "apps.businesses.models.Business.Status",
        "InvitationStatusEnum": "apps.businesses.models.StaffInvitation.Status",
        "SubscriptionStatusEnum": "apps.billing.models.Subscription.Status",
        "BillingIntervalEnum": "apps.billing.models.BillingInterval",
        "PaymentKindEnum": "apps.billing.models.Payment.Kind",
        # Product and Catalogue statuses share the same choices (draft/published/archived).
        "ContentStatusEnum": "apps.products.models.ProductStatus",
        "CategoryStatusEnum": "apps.products.models.CategoryStatus",
        "StockStatusEnum": "apps.products.models.StockStatus",
        "MediaKindEnum": "apps.media_library.models.MediaKind",
        "MediaFolderEnum": "apps.media_library.models.MediaFolder",
        "EnquiryStatusEnum": "apps.enquiries.models.EnquiryStatus",
        "EnquirySourceEnum": "apps.enquiries.models.EnquirySource",
        "TrafficSourceEnum": "apps.analytics.models.TrafficSource",
        "BusinessCategoryEnum": "apps.businesses.models.BusinessCategory",
        "TicketStatusEnum": "apps.support.models.TicketStatus",
        "TicketCategoryEnum": "apps.support.models.TicketCategory",
        "TicketPriorityEnum": "apps.support.models.TicketPriority",
        "NotificationCategoryEnum": "apps.notifications.models.NotificationCategory",
        "NotificationLevelEnum": "apps.notifications.models.NotificationLevel",
        "AuditScopeEnum": "apps.audit_logs.models.AuditScope",
        "AnnouncementAudienceEnum": "apps.notifications.models.AnnouncementAudience",
        "AnnouncementStatusEnum": "apps.notifications.models.AnnouncementStatus",
        "ActorTypeEnum": "apps.audit_logs.models.ActorType",
        "PaymentStatusEnum": "apps.billing.models.Payment.Status",
        "InvoiceStatusEnum": "apps.billing.models.Invoice.Status",
    },
}

# ---------------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])
# The SPA authenticates with Bearer tokens, not cookies, so credentials are not needed.
CORS_ALLOW_CREDENTIALS = False

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=1025)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="myEcatalogues <no-reply@myecatalogues.local>")

# ---------------------------------------------------------------------------
# Application settings
# ---------------------------------------------------------------------------
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173").rstrip("/")
PUBLIC_CATALOGUE_BASE_URL = env(
    "PUBLIC_CATALOGUE_BASE_URL", default=f"{FRONTEND_URL}/c"
).rstrip("/")

# ---------------------------------------------------------------------------
# Billing & payments (see docs/SETUP.md "Payments")
# ---------------------------------------------------------------------------
# Provider used for new checkouts: "" (none configured → checkout returns 503), "razorpay",
# or "mock" (development/tests only — only available when PAYMENT_MOCK_ENABLED is true).
PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", default="")
PAYMENT_MOCK_ENABLED = False  # enabled only by dev.py / test.py; prod.py refuses it
PAYMENT_WEBHOOK_SECRET = env("PAYMENT_WEBHOOK_SECRET", default="")
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID", default="")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET", default="")

BILLING_CURRENCIES = env.list("BILLING_CURRENCIES", default=["INR"])
# Tax is OFF until rates are approved by accounting. Rate is a percentage, e.g. "18.00".
BILLING_TAX_RATE = env("BILLING_TAX_RATE", default="0")
BILLING_TAX_NAME = env("BILLING_TAX_NAME", default="")
BILLING_PRICES_INCLUDE_TAX = env.bool("BILLING_PRICES_INCLUDE_TAX", default=False)
# Seller details printed on invoices.
BILLING_SELLER_NAME = env("BILLING_SELLER_NAME", default="myEcatalogues")
BILLING_SELLER_ADDRESS = env("BILLING_SELLER_ADDRESS", default="")
BILLING_SELLER_EMAIL = env("BILLING_SELLER_EMAIL", default="")
BILLING_SELLER_TAX_ID = env("BILLING_SELLER_TAX_ID", default="")
BILLING_INVOICE_PREFIX = env("BILLING_INVOICE_PREFIX", default="INV")

# Lifecycle tuning. Grace defaults to 0 days (no grace) until a policy is approved.
CHECKOUT_EXPIRY_MINUTES = env.int("CHECKOUT_EXPIRY_MINUTES", default=60)
SUBSCRIPTION_GRACE_DAYS = env.int("SUBSCRIPTION_GRACE_DAYS", default=0)
# In-app "plan ends soon" reminder window used by `manage.py sync_subscriptions` (operational, not commercial).
SUBSCRIPTION_REMINDER_DAYS = env.int("SUBSCRIPTION_REMINDER_DAYS", default=7)
RENEWAL_WINDOW_DAYS = env.int("RENEWAL_WINDOW_DAYS", default=30)

# ---------------------------------------------------------------------------
# Logging (structured JSON lines to stdout)
# ---------------------------------------------------------------------------
LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "apps.core.logging.RequestIdFilter"}},
    "formatters": {
        "json": {"()": "apps.core.logging.JsonFormatter"},
        "console": {"format": "%(asctime)s %(levelname)s [%(name)s] [%(request_id)s] %(message)s"},
    },
    "handlers": {
        "stdout": {
            "class": "logging.StreamHandler",
            "formatter": env("LOG_FORMAT", default="json"),
            "filters": ["request_id"],
        },
    },
    "root": {"handlers": ["stdout"], "level": LOG_LEVEL},
    "loggers": {
        "django": {"handlers": ["stdout"], "level": LOG_LEVEL, "propagate": False},
        "django.db.backends": {"level": "WARNING"},
        "apps": {"handlers": ["stdout"], "level": LOG_LEVEL, "propagate": False},
    },
}
