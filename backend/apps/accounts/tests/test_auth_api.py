import re

import pytest
from django.core import mail
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import PlatformRole, User
from conftest import PASSWORD

pytestmark = pytest.mark.django_db

REGISTER = "/api/v1/auth/register/"
LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/token/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"


def register_payload(**overrides):
    data = {
        "email": "new.owner@example.com",
        "full_name": "New Owner",
        "phone": "+91 90000 00000",
        "password": PASSWORD,
        "password_confirm": PASSWORD,
        "accept_terms": True,
    }
    data.update(overrides)
    return data


def _assert_error(response, status, code):
    assert response.status_code == status, response.content
    body = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["message"]
    assert "request_id" in body
    return body


def _no_secrets(payload):
    text = str(payload).lower()
    assert "password" not in text and "pbkdf2" not in text and "argon2" not in text and "md5$" not in text


# --- Registration ----------------------------------------------------------------------------
def test_register_creates_user_returns_tokens_and_sends_verification(api, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        response = api.post(REGISTER, register_payload(email="New.Owner@Example.com"))
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["access"] and body["refresh"]
    assert body["user"]["email"] == "new.owner@example.com"
    assert body["user"]["is_email_verified"] is False
    _no_secrets(body["user"])
    assert len(mail.outbox) == 1 and "verify-email?token=" in mail.outbox[0].body


def test_register_rejects_duplicate_email_with_different_case(api, make_user):
    make_user(email="taken@example.com")
    body = _assert_error(api.post(REGISTER, register_payload(email="TAKEN@Example.COM")), 400, "validation_error")
    assert "email" in body["error"]["details"]
    assert User.objects.filter(email__iexact="taken@example.com").count() == 1


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"password_confirm": "Different-Passw0rd!"}, "password_confirm"),
        ({"password": "password", "password_confirm": "password"}, "password"),
        ({"accept_terms": False}, "accept_terms"),
        ({"email": "not-an-email"}, "email"),
        ({"full_name": " "}, "full_name"),
    ],
)
def test_register_validation_errors(api, overrides, field):
    body = _assert_error(api.post(REGISTER, register_payload(**overrides)), 400, "validation_error")
    assert field in body["error"]["details"]
    assert not User.objects.exists()


def test_register_cannot_set_platform_role(api):
    response = api.post(REGISTER, register_payload(platform_role="super_admin", is_staff=True, is_superuser=True))
    assert response.status_code == 201
    user = User.objects.get()
    assert user.platform_role == PlatformRole.NONE and not user.is_staff and not user.is_superuser


# --- Login / tokens --------------------------------------------------------------------------
def test_login_with_case_insensitive_email(api, make_user):
    make_user(email="login@example.com")
    response = api.post(LOGIN, {"email": "LOGIN@Example.com", "password": PASSWORD})
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["access"] and body["refresh"] and body["user"]["email"] == "login@example.com"
    _no_secrets(body["user"])


@pytest.mark.parametrize("email,password", [("login@example.com", "wrong-password"), ("nobody@example.com", PASSWORD)])
def test_login_invalid_credentials(api, make_user, email, password):
    make_user(email="login@example.com")
    body = _assert_error(api.post(LOGIN, {"email": email, "password": password}), 401, "no_active_account")
    assert body["error"]["message"] == "Invalid email or password."


def test_inactive_user_cannot_login(api, make_user):
    make_user(email="off@example.com", is_active=False)
    _assert_error(api.post(LOGIN, {"email": "off@example.com", "password": PASSWORD}), 401, "no_active_account")


def test_refresh_rotates_and_old_refresh_token_is_rejected(api, make_user):
    make_user(email="r@example.com")
    tokens = api.post(LOGIN, {"email": "r@example.com", "password": PASSWORD}).json()
    rotated = api.post(REFRESH, {"refresh": tokens["refresh"]})
    assert rotated.status_code == 200
    assert rotated.json()["access"] and rotated.json()["refresh"] != tokens["refresh"]
    _assert_error(api.post(REFRESH, {"refresh": tokens["refresh"]}), 401, "token_not_valid")


def test_garbage_access_token_is_rejected(api):
    api.credentials(HTTP_AUTHORIZATION="Bearer not.a.jwt")
    _assert_error(api.get(ME), 401, "token_not_valid")


def test_logout_blacklists_refresh_token(api, make_user):
    make_user(email="out@example.com")
    tokens = api.post(LOGIN, {"email": "out@example.com", "password": PASSWORD}).json()
    assert api.post(LOGOUT, {"refresh": tokens["refresh"]}).status_code == 204
    _assert_error(api.post(REFRESH, {"refresh": tokens["refresh"]}), 401, "token_not_valid")
    # Logging out twice is harmless.
    assert api.post(LOGOUT, {"refresh": tokens["refresh"]}).status_code == 204


# --- Profile --------------------------------------------------------------------------------
def test_me_requires_authentication(api):
    _assert_error(api.get(ME), 401, "not_authenticated")


def test_me_returns_profile_without_secrets(client_for, make_user):
    user = make_user(email="me@example.com", full_name="Me Myself")
    body = client_for(user).get(ME).json()
    assert body["email"] == "me@example.com" and body["full_name"] == "Me Myself"
    assert set(body) == {"id", "email", "full_name", "phone", "is_email_verified", "platform_role", "date_joined"}


def test_me_update_cannot_escalate_or_change_email(client_for, make_user):
    user = make_user(email="me@example.com")
    response = client_for(user).patch(
        ME,
        {"full_name": "Renamed", "platform_role": "super_admin", "email": "x@example.com", "is_email_verified": True},
    )
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.full_name == "Renamed"
    assert user.platform_role == PlatformRole.NONE
    assert user.email == "me@example.com" and not user.is_email_verified


def test_change_password_requires_current_and_revokes_sessions(api, client_for, make_user):
    user = make_user(email="cp@example.com")
    old = api.post(LOGIN, {"email": "cp@example.com", "password": PASSWORD}).json()
    client = client_for(user)
    bad = client.post(
        "/api/v1/auth/change-password/",
        {"current_password": "nope", "new_password": "N3w-Passw0rd!", "new_password_confirm": "N3w-Passw0rd!"},
    )
    _assert_error(bad, 400, "validation_error")
    ok = client.post(
        "/api/v1/auth/change-password/",
        {"current_password": PASSWORD, "new_password": "N3w-Passw0rd!", "new_password_confirm": "N3w-Passw0rd!"},
    )
    assert ok.status_code == 200 and ok.json()["refresh"]
    _assert_error(api.post(REFRESH, {"refresh": old["refresh"]}), 401, "token_not_valid")
    assert api.post(LOGIN, {"email": "cp@example.com", "password": "N3w-Passw0rd!"}).status_code == 200


# --- Email verification ---------------------------------------------------------------------
def _token_from_mail(pattern):
    match = re.search(pattern, mail.outbox[-1].body)
    assert match, mail.outbox[-1].body
    return match


def test_email_verification_flow(api, client_for, make_user):
    user = make_user(email="verify@example.com")
    client = client_for(user)
    assert client.post("/api/v1/auth/verify-email/resend/").status_code == 200
    token = _token_from_mail(r"verify-email\?token=(\S+)").group(1)

    response = api.post("/api/v1/auth/verify-email/", {"token": token})
    assert response.status_code == 200 and response.json()["is_email_verified"] is True
    user.refresh_from_db()
    assert user.is_email_verified and user.email_verified_at
    # Idempotent, and resending is refused once verified.
    assert api.post("/api/v1/auth/verify-email/", {"token": token}).status_code == 200
    _assert_error(client.post("/api/v1/auth/verify-email/resend/"), 409, "already_verified")


def test_email_verification_rejects_tampered_token(api, make_user):
    make_user(email="verify@example.com")
    body = _assert_error(api.post("/api/v1/auth/verify-email/", {"token": "abc.def.ghi"}), 400, "validation_error")
    assert "token" in body["error"]["details"]


# --- Password reset -------------------------------------------------------------------------
def test_password_reset_does_not_reveal_unknown_emails(api):
    response = api.post("/api/v1/auth/password-reset/", {"email": "ghost@example.com"})
    assert response.status_code == 200
    assert len(mail.outbox) == 0


def test_password_reset_flow_is_single_use_and_revokes_sessions(api, make_user):
    make_user(email="reset@example.com")
    old = api.post(LOGIN, {"email": "reset@example.com", "password": PASSWORD}).json()
    assert api.post("/api/v1/auth/password-reset/", {"email": "RESET@example.com"}).status_code == 200
    match = _token_from_mail(r"reset-password\?uid=([^&\s]+)&token=(\S+)")
    payload = {
        "uid": match.group(1),
        "token": match.group(2),
        "new_password": "Brand-N3w-Pass!",
        "new_password_confirm": "Brand-N3w-Pass!",
    }
    assert api.post("/api/v1/auth/password-reset/confirm/", payload).status_code == 200
    assert api.post(LOGIN, {"email": "reset@example.com", "password": "Brand-N3w-Pass!"}).status_code == 200
    _assert_error(api.post(REFRESH, {"refresh": old["refresh"]}), 401, "token_not_valid")
    # The link cannot be reused.
    _assert_error(api.post("/api/v1/auth/password-reset/confirm/", payload), 400, "validation_error")


def test_password_reset_rejects_bad_uid(api):
    payload = {"uid": "!!!", "token": "x", "new_password": "Brand-N3w-Pass!", "new_password_confirm": "Brand-N3w-Pass!"}
    _assert_error(api.post("/api/v1/auth/password-reset/confirm/", payload), 400, "validation_error")


# --- Rate limiting --------------------------------------------------------------------------
def test_login_is_rate_limited(api, make_user, monkeypatch):
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "auth": "3/min"})
    make_user(email="t@example.com")
    for _ in range(3):
        api.post(LOGIN, {"email": "t@example.com", "password": "wrong"})
    _assert_error(api.post(LOGIN, {"email": "t@example.com", "password": PASSWORD}), 429, "throttled")
