"""
Mock payment provider — development and automated tests ONLY.

It never moves money: every payment it creates is flagged is_test=True. Webhooks are signed with
HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, raw body) in the `X-Mock-Signature` header so the real webhook
verification path is exercised. Production settings refuse to start with it enabled.
"""
import hashlib
import hmac
import json
import secrets
from datetime import datetime

from django.conf import settings

from .base import PaymentProvider, ProviderEvent, ProviderOrder

SIGNATURE_HEADER = "X-Mock-Signature"


def sign(body: bytes, secret: str | None = None) -> str:
    key = (secret if secret is not None else settings.PAYMENT_WEBHOOK_SECRET).encode()
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def build_event_body(*, order_id: str, status: str, amount_minor: int, currency: str, event_id: str | None = None,
                     payment_id: str | None = None, failure_code: str = "", failure_message: str = "") -> bytes:
    return json.dumps(
        {
            "id": event_id or f"mock_evt_{secrets.token_hex(8)}",
            "type": f"payment.{status}",
            "created_at": datetime.now().astimezone().isoformat(),
            "data": {
                "order_id": order_id,
                "payment_id": payment_id or f"mock_pay_{secrets.token_hex(8)}",
                "status": status,
                "amount": amount_minor,
                "currency": currency,
                "failure_code": failure_code,
                "failure_message": failure_message,
            },
        },
        separators=(",", ":"),
    ).encode()


class MockProvider(PaymentProvider):
    name = "mock"
    is_test = True

    # Simulated gateway state for reconciliation tests: order_id -> list[ProviderEvent].
    _orders: dict[str, list[ProviderEvent]] = {}

    def create_order(self, *, reference, amount_minor, currency, notes):
        order_id = f"mock_order_{secrets.token_hex(10)}"
        self._orders[order_id] = []
        return ProviderOrder(order_id=order_id, client_payload={"provider": "mock", "order_id": order_id, "test_mode": True})

    def verify_webhook(self, body, headers):
        secret = settings.PAYMENT_WEBHOOK_SECRET
        received = headers.get(SIGNATURE_HEADER, "")
        return bool(secret) and bool(received) and hmac.compare_digest(sign(body, secret), received)

    def parse_webhook(self, body, headers):
        data = json.loads(body)
        payload = data["data"]
        status = payload["status"]
        if status not in ("captured", "failed"):
            return None
        return ProviderEvent(
            event_id=str(data["id"]),
            event_type=str(data["type"]),
            order_id=str(payload["order_id"]),
            payment_id=str(payload.get("payment_id", "")),
            status=status,
            amount_minor=int(payload["amount"]),
            currency=str(payload["currency"]).upper(),
            failure_code=str(payload.get("failure_code", ""))[:60],
            failure_message=str(payload.get("failure_message", ""))[:255],
        )

    def fetch_order_events(self, order_id):
        return list(self._orders.get(order_id, []))

    @classmethod
    def record_gateway_event(cls, event: ProviderEvent) -> None:
        """Test helper: make the simulated gateway report this attempt during reconciliation."""
        cls._orders.setdefault(event.order_id, []).append(event)
