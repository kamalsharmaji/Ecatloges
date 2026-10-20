import logging
import uuid

from django.conf import settings
from django.db import transaction
from rest_framework import exceptions
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.notifications.emails import send_email

from .models import User
from .tokens import (
    decode_uid,
    encode_uid,
    make_email_verification_token,
    password_reset_token,
    read_email_verification_token,
)

logger = logging.getLogger("apps.accounts")


def issue_tokens(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def revoke_all_refresh_tokens(user) -> None:
    """Blacklist every outstanding refresh token, signing the user out everywhere."""
    for token in OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False):
        BlacklistedToken.objects.get_or_create(token=token)


@transaction.atomic
def register_user(*, email: str, password: str, full_name: str, phone: str = "") -> User:
    user = User.objects.create_user(email=email, password=password, full_name=full_name, phone=phone)
    transaction.on_commit(lambda: send_verification_email(user))
    logger.info("User registered", extra={"user_id": str(user.id)})
    return user


def send_verification_email(user) -> None:
    token = make_email_verification_token(user)
    send_email(
        "account.verify_email",
        to=user.email,
        context={
            "full_name": user.full_name,
            "verify_url": f"{settings.FRONTEND_URL}/verify-email?token={token}",
            "hours": settings.EMAIL_VERIFICATION_TIMEOUT // 3600,
        },
    )


def verify_email(token: str) -> User:
    payload = read_email_verification_token(token)
    invalid = exceptions.ValidationError(
        {"token": ["This verification link is invalid or has expired."]}, code="invalid_token"
    )
    if not payload:
        raise invalid
    try:
        user = User.objects.get(pk=uuid.UUID(payload["uid"]), is_active=True)
    except (User.DoesNotExist, ValueError, KeyError):
        raise invalid from None
    if user.email != payload.get("email"):
        raise invalid
    if not user.is_email_verified:
        user.mark_email_verified()
    return user


def request_password_reset(email: str) -> None:
    """Always succeeds from the caller's view so the endpoint can't be used to enumerate accounts."""
    user = User.objects.filter(email__iexact=email.strip(), is_active=True).first()
    if user is None:
        logger.info("Password reset requested for unknown email")
        return
    token = password_reset_token.make_token(user)
    send_email(
        "account.password_reset",
        to=user.email,
        context={
            "full_name": user.full_name,
            "reset_url": f"{settings.FRONTEND_URL}/reset-password?uid={encode_uid(user)}&token={token}",
            "minutes": settings.PASSWORD_RESET_TIMEOUT // 60,
        },
    )


@transaction.atomic
def reset_password(*, uid: str, token: str, new_password: str) -> User:
    invalid = exceptions.ValidationError(
        {"token": ["This password reset link is invalid or has expired."]}, code="invalid_token"
    )
    user_id = decode_uid(uid)
    try:
        user = User.objects.select_for_update().get(pk=uuid.UUID(user_id), is_active=True) if user_id else None
    except (User.DoesNotExist, ValueError):
        user = None
    if user is None or not password_reset_token.check_token(user, token):
        raise invalid
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_all_refresh_tokens(user)
    _security_event(user, "auth.password_reset")
    logger.info("Password reset completed", extra={"user_id": str(user.id)})
    return user


@transaction.atomic
def change_password(user, *, new_password: str) -> dict:
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_all_refresh_tokens(user)
    _security_event(user, "auth.password_changed")
    return issue_tokens(user)


def _security_event(user, action: str) -> None:
    from apps.audit_logs import services as audit
    from apps.audit_logs.models import AuditScope

    # The new password never reaches the audit trail — only the fact that it changed.
    audit.record(action, actor=user, scope=AuditScope.ACCOUNT, target=user, target_label=user.full_name or user.email)
