from rest_framework.routers import SimpleRouter

from .views import AdminTicketViewSet, TicketViewSet

router = SimpleRouter()
router.register("support/tickets", TicketViewSet, basename="support-ticket")
router.register("admin/support/tickets", AdminTicketViewSet, basename="admin-support-ticket")

urlpatterns = router.urls
