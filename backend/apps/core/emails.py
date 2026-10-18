import logging

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

logger = logging.getLogger("apps.core.emails")


def send_templated_email(*, to: str, subject: str, template: str, context: dict) -> bool:
    """
    Render a plain-text template and send it. Failures are logged, never raised, so a mail outage
    cannot break the user-facing request. Admin-editable templates arrive in Phase 8.
    """
    body = render_to_string(template, context)
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
    except Exception:  # noqa: BLE001
        logger.exception("Email delivery failed", extra={"template": template})
        return False
    logger.info("Email sent", extra={"template": template})
    return True
