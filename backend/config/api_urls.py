"""Version 1 API routes, organised by domain. Each app owns its own urls module."""
from django.urls import include, path

from apps.core.views import HealthCheckView

app_name = "api_v1"

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("", include("apps.accounts.urls")),
    path("", include("apps.businesses.urls")),
    path("", include("apps.billing.urls")),
    path("", include("apps.catalogues.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.audit_logs.urls")),
    path("", include("apps.support.urls")),
    path("", include("apps.platform_admin.urls")),
]
