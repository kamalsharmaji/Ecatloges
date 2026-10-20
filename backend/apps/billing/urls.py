from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("billing/payments", views.PaymentViewSet, basename="billing-payment")
router.register("billing/invoices", views.InvoiceViewSet, basename="billing-invoice")
router.register("admin/plans", views.AdminPlanViewSet, basename="admin-plan")
router.register("admin/subscriptions", views.AdminSubscriptionViewSet, basename="admin-subscription")
router.register("admin/payments", views.AdminPaymentViewSet, basename="admin-payment")
router.register("admin/invoices", views.AdminInvoiceViewSet, basename="admin-invoice")


def _action(name):
    return views.SubscriptionActionView.as_view(action_name=name)


urlpatterns = [
    path("billing/plans/", views.PublicPlanListView.as_view(), name="billing-plans"),
    path("billing/subscription/", views.BillingOverviewView.as_view(), name="billing-overview"),
    path("billing/subscription/cancel/", _action("cancel"), name="billing-cancel"),
    path("billing/subscription/resume/", _action("resume"), name="billing-resume"),
    path("billing/subscription/schedule-downgrade/", _action("schedule-downgrade"), name="billing-schedule-downgrade"),
    path("billing/subscription/clear-scheduled-change/", _action("clear-scheduled"), name="billing-clear-scheduled"),
    path("billing/subscriptions/", views.SubscriptionHistoryView.as_view(), name="billing-history"),
    path("billing/checkout/quote/", views.QuoteView.as_view(), name="billing-quote"),
    path("billing/checkout/", views.CheckoutView.as_view(), name="billing-checkout"),
    path("billing/webhooks/<slug:provider>/", views.WebhookView.as_view(), name="billing-webhook"),
    *router.urls,
]
