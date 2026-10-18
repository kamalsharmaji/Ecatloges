from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.rbac.views import PermissionListView, RoleViewSet

from . import views

router = SimpleRouter()
router.register("members", views.MembershipViewSet, basename="member")
router.register("invitations", views.InvitationViewSet, basename="invitation")
router.register("roles", RoleViewSet, basename="role")

urlpatterns = [
    path("businesses/", views.BusinessListCreateView.as_view(), name="business-list"),
    path("businesses/<uuid:business_id>/", views.BusinessDetailView.as_view(), name="business-detail"),
    path("business-context/", views.BusinessContextView.as_view(), name="business-context"),
    path("business-context/leave/", views.LeaveBusinessView.as_view(), name="business-leave"),
    path("invitations/accept/", views.AcceptInvitationView.as_view(), name="invitation-accept"),
    path("permissions/", PermissionListView.as_view(), name="permission-list"),
    *router.urls,
]
