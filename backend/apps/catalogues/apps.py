from django.apps import AppConfig


class CataloguesConfig(AppConfig):
    name = "apps.catalogues"
    label = "catalogues"
    verbose_name = "Catalogues"

    def ready(self):
        from apps.billing.entitlements import register_usage_counter

        from .services import active_catalogue_count

        register_usage_counter("max_catalogues", active_catalogue_count)
