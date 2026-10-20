from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("admin/businesses", views.AdminBusinessViewSet, basename="admin-business")
router.register("admin/users", views.AdminUserViewSet, basename="admin-user")
router.register("admin/catalogues", views.AdminCatalogueViewSet, basename="admin-catalogue")

urlpatterns = [
    path("admin/dashboard/", views.DashboardView.as_view(), name="admin-dashboard"),
    path("admin/system/", views.SystemStatusView.as_view(), name="admin-system"),
    *router.urls,
]
