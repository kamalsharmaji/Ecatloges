from django.urls import path
from rest_framework.routers import SimpleRouter

from .admin_views import AdminAnnouncementViewSet, AdminEmailTemplateViewSet, AnnouncementFeedView
from .views import NotificationViewSet

router = SimpleRouter()
router.register("notifications", NotificationViewSet, basename="notification")
router.register("admin/announcements", AdminAnnouncementViewSet, basename="admin-announcement")
router.register("admin/email-templates", AdminEmailTemplateViewSet, basename="admin-email-template")

urlpatterns = [
    path("announcements/", AnnouncementFeedView.as_view(), name="announcement-feed"),
    *router.urls,
]
