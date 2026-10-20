"""Delete stored files only after the database row is really gone (transaction committed)."""
import logging

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import MediaAsset

logger = logging.getLogger("apps.media_library")


def delete_files(names: list[str]) -> None:
    for name in names:
        try:
            default_storage.delete(name)
        except OSError:
            logger.warning("Could not delete media file", extra={"file": name})


@receiver(post_delete, sender=MediaAsset)
def _cleanup_files(sender, instance: MediaAsset, **kwargs):
    names = instance.file_names()
    transaction.on_commit(lambda: delete_files(names))
