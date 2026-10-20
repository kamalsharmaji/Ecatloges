from django.apps import AppConfig


class BillingConfig(AppConfig):
    name = "apps.billing"
    label = "billing"
    verbose_name = "Billing"

    def ready(self):
        from . import checks  # noqa: F401  (registers payment configuration checks)
