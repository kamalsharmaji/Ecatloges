import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("apps.core.emails")


def send_plain_email(*, to: str, subject: str, body: str, tag: str) -> bool:
    """
    Send one plain-text email. Failures are logged, never raised, so a mail outage cannot break the
    user-facing request or change application state. Content comes from apps.notifications.emails.
    """
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
    except Exception:  # noqa: BLE001
        logger.exception("Email delivery failed", extra={"template": tag})
        return False
    logger.info("Email sent", extra={"template": tag})
    return True
