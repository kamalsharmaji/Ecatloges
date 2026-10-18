"""
Standardised API error responses.

Every error returned by the API has the shape:

    {
      "error": {
        "code": "validation_error",
        "message": "Human readable summary.",
        "details": {"field": ["problem"]}   # optional
      },
      "request_id": "..."
    }
"""
import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .logging import request_id_var

logger = logging.getLogger("apps.core.exceptions")


class BusinessRuleViolation(exceptions.APIException):
    """Raised when a request is valid but breaks a domain rule (e.g. plan limit reached)."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action is not allowed in the current state."
    default_code = "business_rule_violation"


class PlanLimitExceeded(exceptions.APIException):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = "Your subscription plan limit has been reached."
    default_code = "plan_limit_exceeded"


def _first_message(detail) -> str:
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    if isinstance(detail, dict) and detail:
        key, value = next(iter(detail.items()))
        message = _first_message(value)
        return message if key in ("non_field_errors", "detail") else f"{key}: {message}"
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        )
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API exception", exc_info=exc)
        return Response(
            {
                "error": {"code": "server_error", "message": "An unexpected error occurred."},
                "request_id": request_id_var.get(),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, exceptions.ValidationError):
        code = "validation_error"
        message = _first_message(exc.detail)
        details = exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail}
    else:
        codes = exc.get_codes() if isinstance(exc, exceptions.APIException) else None
        code = codes if isinstance(codes, str) else getattr(exc, "default_code", "error")
        message = _first_message(response.data.get("detail", response.data)) if isinstance(
            response.data, dict
        ) else _first_message(response.data)
        details = None

    body = {"error": {"code": code, "message": message}, "request_id": request_id_var.get()}
    if details is not None:
        body["error"]["details"] = details
    response.data = body
    return response
