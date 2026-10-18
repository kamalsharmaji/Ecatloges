import pytest
from django.http import Http404
from rest_framework import exceptions
from rest_framework.test import APIClient

from apps.core.checks import jwt_signing_key_check
from apps.core.exceptions import api_exception_handler

pytestmark = pytest.mark.django_db


def test_health_check_reports_database_ok():
    response = APIClient().get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert response["X-Request-ID"]


def test_request_id_is_echoed_when_valid():
    response = APIClient().get("/api/v1/health/", HTTP_X_REQUEST_ID="abc12345-trace")
    assert response["X-Request-ID"] == "abc12345-trace"


def test_validation_errors_use_standard_shape():
    exc = exceptions.ValidationError({"email": ["This field is required."]})
    response = api_exception_handler(exc, {})
    assert response.status_code == 400
    assert response.data["error"] == {
        "code": "validation_error",
        "message": "email: This field is required.",
        "details": {"email": ["This field is required."]},
    }
    assert "request_id" in response.data


def test_auth_errors_use_standard_shape():
    response = api_exception_handler(exceptions.NotAuthenticated(), {})
    assert response.status_code == 401
    assert response.data["error"]["code"] == "not_authenticated"
    assert "details" not in response.data["error"]


def test_django_404_is_translated():
    response = api_exception_handler(Http404(), {})
    assert response.status_code == 404
    assert response.data["error"]["code"] == "not_found"


def test_empty_jwt_signing_key_fails_system_check(settings):
    settings.SIMPLE_JWT = {**settings.SIMPLE_JWT, "SIGNING_KEY": ""}
    assert [e.id for e in jwt_signing_key_check(None)] == ["core.E001"]


def test_openapi_schema_is_generated():
    response = APIClient().get("/api/schema/")
    assert response.status_code == 200
    assert b"myEcatalogues API" in response.content
