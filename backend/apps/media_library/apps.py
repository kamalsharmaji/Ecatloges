from django.apps import AppConfig


class MediaLibraryConfig(AppConfig):
    name = "apps.media_library"
    label = "media_library"
    verbose_name = "Media library"

    def ready(self):
        from apps.billing.entitlements import register_usage_counter

        from . import signals  # noqa: F401  (file cleanup)
        from .services import storage_used_mb

        register_usage_counter("storage_limit_mb", storage_used_mb)
