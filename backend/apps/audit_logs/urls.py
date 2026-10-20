from rest_framework.routers import SimpleRouter

from .views import ActivityLogViewSet, PlatformAuditLogViewSet

router = SimpleRouter()
router.register("activity", ActivityLogViewSet, basename="activity")
router.register("admin/audit-logs", PlatformAuditLogViewSet, basename="admin-audit-log")

urlpatterns = router.urls
