from django.apps import AppConfig


class ProductsConfig(AppConfig):
    name = "apps.products"
    label = "products"
    verbose_name = "Products & categories"

    def ready(self):
        from apps.billing.entitlements import register_usage_counter

        from .services import active_product_count

        register_usage_counter("max_products", active_product_count)
