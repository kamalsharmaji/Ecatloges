from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.analytics.views import AnalyticsOverviewView, PublicEventView
from apps.enquiries.views import CustomerViewSet, EnquiryViewSet, PublicEnquiryView
from apps.media_library.views import MediaViewSet
from apps.products.views import CategoryViewSet, ProductViewSet

from . import views

router = SimpleRouter()
router.register("catalogues", views.CatalogueViewSet, basename="catalogue")
router.register("products", ProductViewSet, basename="product")
router.register("categories", CategoryViewSet, basename="category")
router.register("media", MediaViewSet, basename="media")
router.register("enquiries", EnquiryViewSet, basename="enquiry")
router.register("customers", CustomerViewSet, basename="customer")

PUBLIC = "public/catalogues/<slug:business_slug>/<slug:catalogue_slug>/"

urlpatterns = [
    path("analytics/overview/", AnalyticsOverviewView.as_view(), name="analytics-overview"),
    path(f"{PUBLIC}enquiries/", PublicEnquiryView.as_view(), name="public-enquiry"),
    path(f"{PUBLIC}events/", PublicEventView.as_view(), name="public-event"),
    path(f"{PUBLIC}qr.svg", views.PublicCatalogueQrView.as_view(), name="public-catalogue-qr"),
    path(PUBLIC, views.PublicCatalogueView.as_view(), name="public-catalogue"),
    path(f"{PUBLIC}products/", views.PublicProductListView.as_view(), name="public-catalogue-products"),
    path(f"{PUBLIC}products/<uuid:product_id>/", views.PublicProductDetailView.as_view(), name="public-catalogue-product"),
    *router.urls,
]
