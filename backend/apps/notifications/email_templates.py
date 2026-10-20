"""
Editable email templates with a deliberately tiny syntax.

Admins can edit the subject and body of each email, but the content is NEVER passed to Django's
template engine (or any evaluator). The only construct is a placeholder `{{ variable }}` from that
template's allowlist; everything else is literal text. Rules:

- Unknown variables, `{% … %}` / `{# … #}` tags and malformed `{{ … }}` are rejected on save.
- Required variables (e.g. the verification link) must be present, so an edit can't break a flow.
- A line whose placeholders all render empty is dropped — this replaces "if" blocks for optional
  details (e.g. "Email: …" when the customer gave no email).
- Emails are plain text: values are inserted verbatim, nothing is interpreted as markup. Newlines
  in values are flattened in the subject (header-injection safe).

If a stored template is missing, inactive or (somehow) invalid, the built-in default below is used.
"""
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger("apps.notifications.email")

PLACEHOLDER = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}")
ANY_TAG = re.compile(r"\{\{|\}\}|\{%|%\}|\{#|#\}")
MAX_SUBJECT = 200
MAX_BODY = 10_000


@dataclass(frozen=True)
class TemplateDef:
    key: str
    name: str
    description: str
    variables: dict[str, str]
    sample: dict[str, str]
    subject: str
    body: str
    required: tuple[str, ...] = ()
    # Security / transactional mails are always sent; preferences can't switch them off.
    mandatory: bool = True
    group: str = "Account"
    extra: dict = field(default_factory=dict)


SIGN_OFF = "— The myEcatalogues team"

REGISTRY: dict[str, TemplateDef] = {
    t.key: t
    for t in [
        TemplateDef(
            key="account.verify_email",
            name="Verify email address",
            description="Sent after sign-up and when a user asks for a new verification link.",
            variables={"full_name": "User's full name", "verify_url": "Verification link", "hours": "Link validity in hours"},
            sample={"full_name": "Priya Mehta", "verify_url": "https://example.com/verify-email?token=sample", "hours": "48"},
            required=("verify_url",),
            subject="Verify your myEcatalogues email address",
            body=(
                "Hi {{ full_name }},\n\nWelcome to myEcatalogues! Please confirm your email address:\n\n{{ verify_url }}\n\n"
                "This link is valid for {{ hours }} hours.\n\nIf you didn't create an account, you can ignore this email.\n\n"
                f"{SIGN_OFF}\n"
            ),
        ),
        TemplateDef(
            key="account.password_reset",
            name="Password reset",
            description="Sent when someone requests a password reset.",
            variables={"full_name": "User's full name", "reset_url": "Reset link", "minutes": "Link validity in minutes"},
            sample={"full_name": "Priya Mehta", "reset_url": "https://example.com/reset-password?uid=x&token=sample", "minutes": "60"},
            required=("reset_url",),
            subject="Reset your myEcatalogues password",
            body=(
                "Hi {{ full_name }},\n\nWe received a request to reset your myEcatalogues password. Choose a new password here:\n\n"
                "{{ reset_url }}\n\nThis link is valid for {{ minutes }} minutes and can only be used once.\n\n"
                "If you didn't request a password reset, you can ignore this email — your password won't change.\n\n"
                f"{SIGN_OFF}\n"
            ),
        ),
        TemplateDef(
            key="team.invitation",
            name="Team invitation",
            description="Sent to people invited to join a business.",
            group="Team",
            variables={
                "business_name": "Business name", "role_name": "Role offered", "inviter_name": "Who sent the invitation",
                "accept_url": "Invitation link", "expires_on": "Expiry date and time (UTC)",
            },
            sample={
                "business_name": "Sharma Furniture", "role_name": "Manager", "inviter_name": "Rahul Sharma",
                "accept_url": "https://example.com/invitations/accept?token=sample", "expires_on": "26 Oct 2026, 10:00",
            },
            required=("accept_url",),
            subject="You're invited to join {{ business_name }} on myEcatalogues",
            body=(
                "Hello,\n\n{{ inviter_name }} has invited you to join {{ business_name }} on myEcatalogues as {{ role_name }}.\n\n"
                "Accept the invitation:\n{{ accept_url }}\n\n"
                "Sign in (or create an account) with this email address to accept. The link expires on {{ expires_on }} UTC.\n\n"
                "If you weren't expecting this invitation, you can ignore this email.\n\n"
                f"{SIGN_OFF}\n"
            ),
        ),
        TemplateDef(
            key="enquiry.new",
            name="New enquiry (to the business)",
            description="Sent to the business email address for each new enquiry (switchable per business in Settings).",
            group="Enquiries",
            mandatory=False,
            variables={
                "business_name": "Business name", "catalogue_name": "Catalogue the enquiry came from",
                "customer_name": "Customer's name", "customer_phone": "Customer's phone", "customer_email": "Customer's email (may be empty)",
                "product_name": "Product (may be empty)", "quantity": "Quantity (may be empty)", "message": "Customer's message",
                "panel_url": "Link to the enquiry in the dashboard",
            },
            sample={
                "business_name": "Sharma Furniture", "catalogue_name": "Furniture Collection", "customer_name": "Amit Patel",
                "customer_phone": "+919827165432", "customer_email": "amit@example.com", "product_name": "Wooden Chair",
                "quantity": "5", "message": "Please share the best price for 5 pieces.",
                "panel_url": "https://example.com/app/enquiries?enquiry=sample",
            },
            required=("panel_url",),
            subject="New enquiry from {{ customer_name }}",
            body=(
                "Hello {{ business_name }},\n\nYou have a new enquiry from your catalogue \"{{ catalogue_name }}\".\n\n"
                "Name: {{ customer_name }}\nPhone: {{ customer_phone }}\nEmail: {{ customer_email }}\n"
                "Product: {{ product_name }}\nQuantity: {{ quantity }}\n\nMessage:\n{{ message }}\n\n"
                "Open it in your dashboard:\n{{ panel_url }}\n\n— myEcatalogues\n"
            ),
        ),
        TemplateDef(
            key="support.reply",
            name="Support reply",
            description="Sent to the person who opened a ticket when support replies.",
            group="Support",
            mandatory=False,
            variables={"name": "Requester's name", "ticket_reference": "e.g. TKT-1001", "ticket_subject": "Ticket subject", "ticket_url": "Link to the ticket"},
            sample={"name": "Priya Mehta", "ticket_reference": "TKT-1001", "ticket_subject": "Cannot upload product images", "ticket_url": "https://example.com/app/support?ticket=sample"},
            required=("ticket_url",),
            subject="Re: [{{ ticket_reference }}] {{ ticket_subject }}",
            body=(
                "Hello {{ name }},\n\nOur support team has replied to your ticket {{ ticket_reference }}: \"{{ ticket_subject }}\".\n\n"
                "Read the reply and respond here:\n{{ ticket_url }}\n\n— myEcatalogues Support\n"
            ),
        ),
        TemplateDef(
            key="support.resolved",
            name="Support ticket resolved",
            description="Sent to the requester when support marks a ticket as resolved.",
            group="Support",
            mandatory=False,
            variables={"name": "Requester's name", "ticket_reference": "e.g. TKT-1001", "ticket_subject": "Ticket subject", "ticket_url": "Link to the ticket"},
            sample={"name": "Priya Mehta", "ticket_reference": "TKT-1001", "ticket_subject": "Cannot upload product images", "ticket_url": "https://example.com/app/support?ticket=sample"},
            required=("ticket_url",),
            subject="[{{ ticket_reference }}] resolved",
            body=(
                "Hello {{ name }},\n\nYour ticket {{ ticket_reference }} (\"{{ ticket_subject }}\") has been marked as resolved.\n\n"
                "If the problem isn't fixed, you can reopen it here:\n{{ ticket_url }}\n\n— myEcatalogues Support\n"
            ),
        ),
        TemplateDef(
            key="announcement.published",
            name="Announcement",
            description="Sent with a published announcement to recipients who opted in to announcement emails.",
            group="Announcements",
            mandatory=False,
            variables={"name": "Recipient's name", "title": "Announcement title", "message": "Announcement text", "url": "Link to the app"},
            sample={"name": "Priya Mehta", "title": "New: video uploads", "message": "You can now add product videos up to 200 MB.", "url": "https://example.com/app"},
            subject="{{ title }}",
            body="Hello {{ name }},\n\n{{ message }}\n\nOpen myEcatalogues:\n{{ url }}\n\n— The myEcatalogues team\n",
        ),
    ]
}


class TemplateError(ValueError):
    def __init__(self, errors: dict[str, list[str]]):
        super().__init__("Invalid email template")
        self.errors = errors


def _check(text: str, allowed: dict, field: str, errors: dict) -> set[str]:
    used = set(PLACEHOLDER.findall(text))
    leftover = PLACEHOLDER.sub("", text)
    if ANY_TAG.search(leftover):
        errors.setdefault(field, []).append(
            "Only {{ variable }} placeholders are allowed — no template tags, filters or expressions."
        )
    unknown = sorted(used - set(allowed))
    if unknown:
        errors.setdefault(field, []).append(
            f"Unknown variable(s): {', '.join(unknown)}. Allowed: {', '.join(sorted(allowed))}."
        )
    return used


def validate(definition: TemplateDef, subject: str, body: str) -> None:
    errors: dict[str, list[str]] = {}
    subject = subject or ""
    body = body or ""
    if not subject.strip():
        errors["subject"] = ["Enter a subject."]
    elif len(subject) > MAX_SUBJECT:
        errors["subject"] = [f"Keep the subject under {MAX_SUBJECT} characters."]
    elif "\n" in subject or "\r" in subject:
        errors["subject"] = ["The subject must be a single line."]
    if not body.strip():
        errors["body"] = ["Enter the email text."]
    elif len(body) > MAX_BODY:
        errors["body"] = [f"Keep the email under {MAX_BODY} characters."]
    used = _check(subject, definition.variables, "subject", errors) | _check(body, definition.variables, "body", errors)
    missing = [v for v in definition.required if v not in used]
    if missing:
        errors.setdefault("body", []).append(f"Must include: {', '.join('{{ ' + m + ' }}' for m in missing)}.")
    if errors:
        raise TemplateError(errors)


def _value(context: dict, name: str) -> str:
    value = context.get(name)
    return "" if value is None else str(value)


def render_text(text: str, context: dict, *, single_line: bool = False) -> str:
    def sub(match):
        value = _value(context, match.group(1))
        return " ".join(value.split()) if single_line else value

    if single_line:
        return PLACEHOLDER.sub(sub, text).strip()
    lines = []
    for line in text.split("\n"):
        names = PLACEHOLDER.findall(line)
        if names and all(not _value(context, n) for n in names):
            continue  # optional detail that has no value
        lines.append(PLACEHOLDER.sub(sub, line))
    return "\n".join(lines)


def render(definition: TemplateDef, subject: str, body: str, context: dict) -> tuple[str, str]:
    values = {k: context.get(k) for k in definition.variables}  # never anything outside the allowlist
    return render_text(subject, values, single_line=True), render_text(body, values)


def active_source(key: str) -> tuple[str, str, bool]:
    """(subject, body, is_custom) — the stored version when active and valid, else the default."""
    from .models import EmailTemplate

    definition = REGISTRY[key]
    stored = EmailTemplate.objects.filter(key=key, is_active=True).first()
    if stored is not None:
        try:
            validate(definition, stored.subject, stored.body)
            return stored.subject, stored.body, True
        except TemplateError:
            logger.error("Stored email template is invalid; using the default", extra={"template": key})
    return definition.subject, definition.body, False
