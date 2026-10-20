"""Every application email goes through `send_email`, so admin-edited templates apply everywhere."""
from apps.core.emails import send_plain_email

from .email_templates import REGISTRY, active_source, render


def send_email(key: str, *, to: str, context: dict) -> bool:
    definition = REGISTRY[key]
    subject_src, body_src, _ = active_source(key)
    subject, body = render(definition, subject_src, body_src, context)
    return send_plain_email(to=to, subject=subject, body=body, tag=key)
