"""
Signed, expiring tokens for account emails.

- Email verification: a timestamped signature over (user id, email). Changing the email
  invalidates outstanding links.
- Password reset: Django's PasswordResetTokenGenerator, which is bound to the password hash and
  last login, so a link stops working once it is used.
"""
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

_VERIFY_SALT = "accounts.email-verification"


def make_email_verification_token(user) -> str:
    return signing.dumps({"uid": str(user.pk), "email": user.email}, salt=_VERIFY_SALT, compress=True)


def read_email_verification_token(token: str) -> dict | None:
    try:
        return signing.loads(token, salt=_VERIFY_SALT, max_age=settings.EMAIL_VERIFICATION_TIMEOUT)
    except signing.BadSignature:  # includes SignatureExpired
        return None


def encode_uid(user) -> str:
    return urlsafe_base64_encode(force_bytes(user.pk))


def decode_uid(uid: str) -> str | None:
    try:
        return force_str(urlsafe_base64_decode(uid))
    except (TypeError, ValueError, OverflowError):
        return None


password_reset_token = default_token_generator
