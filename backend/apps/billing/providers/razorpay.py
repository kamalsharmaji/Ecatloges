"""
Razorpay adapter — PREPARED, NOT VERIFIED.

Written against Razorpay's documented Orders API, webhook signature scheme
(HMAC-SHA256 of the raw body with the webhook secret, header `X-Razorpay-Signature`) and checkout
signature (HMAC-SHA256 of "order_id|payment_id" with the key secret). It has only been unit-tested
with locally built fixtures; it must be verified end-to-end against a Razorpay test-mode account
before accepting real payments. Credentials come exclusively from environment variables.
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from django.conf import settings

from .base import PaymentProvider, ProviderError, ProviderEvent, ProviderOrder

API_BASE = "https://api.razorpay.com/v1"
SIGNATURE_HEADER = "X-Razorpay-Signature"
EVENT_ID_HEADER = "X-Razorpay-Event-Id"

_STATUS = {"captured": "captured", "failed": "failed", "authorized": "pending", "created": "pending"}


class RazorpayProvider(PaymentProvider):
    name = "razorpay"
    is_test = False

    def __init__(self):
        self.key_id = settings.RAZORPAY_KEY_ID
        self.key_secret = settings.RAZORPAY_KEY_SECRET
        self.webhook_secret = settings.PAYMENT_WEBHOOK_SECRET

    # -- HTTP --------------------------------------------------------------------------------
    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        if not (self.key_id and self.key_secret):
            raise ProviderError("Razorpay credentials are not configured.")
        token = base64.b64encode(f"{self.key_id}:{self.key_secret}".encode()).decode()
        request = urllib.request.Request(
            f"{API_BASE}{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            method=method,
            headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed https URL
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            raise ProviderError(f"Razorpay API returned HTTP {exc.code}.") from None
        except (urllib.error.URLError, TimeoutError):
            raise ProviderError("Razorpay API is unreachable.") from None

    # -- Interface ---------------------------------------------------------------------------
    def create_order(self, *, reference, amount_minor, currency, notes):
        data = self._request(
            "POST", "/orders", {"amount": amount_minor, "currency": currency, "receipt": reference[:40], "notes": notes}
        )
        return ProviderOrder(
            order_id=data["id"],
            client_payload={
                "provider": "razorpay",
                "key_id": self.key_id,  # public key, safe for the browser
                "order_id": data["id"],
                "amount": amount_minor,
                "currency": currency,
            },
        )

    def verify_webhook(self, body, headers):
        received = headers.get(SIGNATURE_HEADER, "")
        if not (self.webhook_secret and received):
            return False
        expected = hmac.new(self.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, received)

    def parse_webhook(self, body, headers):
        data = json.loads(body)
        event_type = data.get("event", "")
        if event_type not in ("payment.captured", "payment.failed", "order.paid"):
            return None
        entity = data["payload"]["payment"]["entity"]
        return self._event_from_entity(
            entity,
            event_id=headers.get(EVENT_ID_HEADER) or f"{event_type}:{entity['id']}",
            event_type=event_type,
        )

    def fetch_order_events(self, order_id):
        data = self._request("GET", f"/orders/{order_id}/payments")
        return [
            self._event_from_entity(entity, event_id=f"reconcile:{entity['id']}:{entity['status']}", event_type="reconcile")
            for entity in data.get("items", [])
        ]

    def verify_client_confirmation(self, payment, data):
        payment_id = str(data.get("razorpay_payment_id", ""))
        signature = str(data.get("razorpay_signature", ""))
        if not (payment_id and signature and self.key_secret):
            return None
        message = f"{payment.provider_order_id}|{payment_id}".encode()
        expected = hmac.new(self.key_secret.encode(), message, hashlib.sha256).hexdigest()
        return payment_id if hmac.compare_digest(expected, signature) else None

    @staticmethod
    def _event_from_entity(entity: dict, *, event_id: str, event_type: str) -> ProviderEvent:
        return ProviderEvent(
            event_id=event_id,
            event_type=event_type,
            order_id=str(entity.get("order_id", "")),
            payment_id=str(entity.get("id", "")),
            status=_STATUS.get(entity.get("status", ""), "pending"),
            amount_minor=int(entity["amount"]) if entity.get("amount") is not None else None,
            currency=str(entity.get("currency", "")).upper(),
            failure_code=str(entity.get("error_code") or "")[:60],
            failure_message=str(entity.get("error_description") or "")[:255],
        )
