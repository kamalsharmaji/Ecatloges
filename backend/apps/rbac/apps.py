from django.apps import AppConfig
from django.db.models.signals import post_migrate


class RbacConfig(AppConfig):
    name = "apps.rbac"
    label = "rbac"
    verbose_name = "Roles & permissions"

    def ready(self):
        from .signals import sync_rbac

        post_migrate.connect(sync_rbac, sender=self)
