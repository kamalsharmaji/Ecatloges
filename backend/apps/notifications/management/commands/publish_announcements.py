"""
Publish scheduled announcements whose start time has arrived.

Schedule every 1–5 minutes (cron / Windows Task Scheduler). Safe to run repeatedly or concurrently:
each announcement is locked and delivered at most once.
"""
from django.core.management.base import BaseCommand

from apps.notifications.announcements import deliver_due


class Command(BaseCommand):
    help = "Publish and deliver scheduled announcements that are due."

    def handle(self, *args, **options):
        self.stdout.write(f"Published {deliver_due()} scheduled announcement(s).")
