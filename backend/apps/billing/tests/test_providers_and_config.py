import hashlib
import hmac
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.test import override_settings

from apps.billing.checks import payment_configuration_check
from apps.billing.providers import ProviderUnavailable, get_provider_by_name
from apps.billing.providers.razorpay import RazorpayProvider

BACKEND_DIR = Path(__file__).resolve().parents[3]


# --- Production safety -------------------------------------------------------------------------
def _load_prod_settings(**env):
    """Import config.settings.prod in a clean interpreter and report whether it loads."""
    environment = {
        **os.environ,
        "DJANGO_SECRET_KEY": "x" * 60,
        "PAYMENT_PROVIDER": "razorpay",
        "PAYMENT_WEBHOOK_SECRET": "whsec",
        "RAZORPAY_KEY_ID": "rzp_test_x",
        "RAZORPAY_KEY_SECRET": "secret",
        **env,
    }
    environment.pop("DJANGO_SETTINGS_MODULE", None)
    return subprocess.run(
        [sys.executable, "-c", "import config.settings.prod"],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_production_settings_load_with_real_provider():
    result = _load_prod_settings()
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("env", [{"PAYMENT_PROVIDER": "mock"}, {"PAYMENT_MOCK_ENABLED": "true"}])
def test_production_settings_refuse_mock_payments(env):
    result = _load_prod_settings(**env)
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr and "mock payment provider" in result.stderr


def _ids(**overrides):
    with override_settings(**overrides):
        return [e.id for e in payment_configuration_check(None)]


def test_configuration_checks():
    assert _ids() == []  # test settings are valid
    assert "billing.E001" in _ids(PAYMENT_PROVIDER="mock", PAYMENT_MOCK_ENABLED=False)
    assert "billing.E002" in _ids(PAYMENT_MOCK_ENABLED=True, DEBUG=False, TESTING=False)
    assert "billing.E003" in _ids(PAYMENT_PROVIDER="razorpay", PAYMENT_WEBHOOK_SECRET="", RAZORPAY_KEY_ID="k",
                                  RAZORPAY_KEY_SECRET="s")
    assert "billing.E004" in _ids(PAYMENT_PROVIDER="razorpay", PAYMENT_WEBHOOK_SECRET="w")


@override_settings(PAYMENT_MOCK_ENABLED=False)
def test_mock_provider_does_not_exist_when_disabled():
    with pytest.raises(ProviderUnavailable):
        get_provider_by_name("mock")


# --- Razorpay adapter (offline; NOT a substitute for sandbox verification) ----------------------
def _rzp(secret="whsec", key_secret="keysecret"):
    with override_settings(PAYMENT_WEBHOOK_SECRET=secret, RAZORPAY_KEY_ID="rzp_test_x", RAZORPAY_KEY_SECRET=key_secret):
        return RazorpayProvider()


def _captured_body():
    return json.dumps(
        {
            "event": "payment.captured",
            "payload": {"payment": {"entity": {
                "id": "pay_ABC", "order_id": "order_XYZ", "status": "captured", "amount": 100000, "currency": "INR",
                "email": "customer@example.com", "contact": "+919999999999", "method": "card",
            }}},
        }
    ).encode()


def test_razorpay_webhook_signature():
    provider = _rzp()
    body = _captured_body()
    good = hmac.new(b"whsec", body, hashlib.sha256).hexdigest()
    assert provider.verify_webhook(body, {"X-Razorpay-Signature": good})
    assert not provider.verify_webhook(body, {"X-Razorpay-Signature": "0" * 64})
    assert not provider.verify_webhook(body + b" ", {"X-Razorpay-Signature": good})
    assert not _rzp(secret="").verify_webhook(body, {"X-Razorpay-Signature": good})


def test_razorpay_event_parsing_keeps_no_customer_data():
    event = _rzp().parse_webhook(_captured_body(), {"X-Razorpay-Event-Id": "evt_1"})
    assert (event.event_id, event.order_id, event.payment_id, event.status, event.amount_minor, event.currency) == (
        "evt_1", "order_XYZ", "pay_ABC", "captured", 100000, "INR"
    )
    assert "customer@example.com" not in json.dumps(event.summary())
    assert _rzp().parse_webhook(json.dumps({"event": "refund.created"}).encode(), {}) is None


def test_razorpay_checkout_signature():
    provider = _rzp()
    payment = SimpleNamespace(provider_order_id="order_XYZ")
    signature = hmac.new(b"keysecret", b"order_XYZ|pay_ABC", hashlib.sha256).hexdigest()
    assert provider.verify_client_confirmation(payment, {"razorpay_payment_id": "pay_ABC", "razorpay_signature": signature}) == "pay_ABC"
    assert provider.verify_client_confirmation(payment, {"razorpay_payment_id": "pay_ABC", "razorpay_signature": "bad"}) is None
