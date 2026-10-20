"""
Provider-independent payment interface.

A provider only talks to the payment gateway: create an order, authenticate webhooks, translate
gateway events into ProviderEvent, and look up an order's state for reconciliation. All
subscription rules live in apps.billing.services and never depend on a specific gateway.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


class ProviderError(Exception):
    """Gateway unreachable or rejected a request. The message is safe to log (no secrets)."""


@dataclass(frozen=True)
class ProviderOrder:
    order_id: str
    # Data the browser needs to open the gateway's checkout (public values only, never secrets).
    client_payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderEvent:
    """A normalised payment state change."""

    event_id: str
    event_type: str
    order_id: str
    status: str  # "captured" | "failed" | "pending"
    payment_id: str = ""
    amount_minor: int | None = None
    currency: str = ""
    failure_code: str = ""
    failure_message: str = ""
    occurred_at: datetime | None = None

    def summary(self) -> dict:
        """Safe subset persisted in PaymentEvent.summary (no customer or instrument details)."""
        return {
            "type": self.event_type,
            "order_id": self.order_id,
            "payment_id": self.payment_id,
            "status": self.status,
            "amount_minor": self.amount_minor,
            "currency": self.currency,
            "failure_code": self.failure_code,
        }


class PaymentProvider(ABC):
    name: str = ""
    is_test: bool = False

    @abstractmethod
    def create_order(self, *, reference: str, amount_minor: int, currency: str, notes: dict) -> ProviderOrder: ...

    @abstractmethod
    def verify_webhook(self, body: bytes, headers) -> bool:
        """Authenticate the request using the gateway's official signature scheme."""

    @abstractmethod
    def parse_webhook(self, body: bytes, headers) -> ProviderEvent | None:
        """Return None for event types that don't affect payments."""

    @abstractmethod
    def fetch_order_events(self, order_id: str) -> list[ProviderEvent]:
        """Current payment attempts for an order, straight from the gateway (reconciliation)."""

    def verify_client_confirmation(self, payment, data: dict) -> str | None:
        """
        Optional: verify a signed checkout-completion payload posted by the browser and return the
        gateway payment id. A confirmation only triggers reconciliation; it never activates anything.
        """
        return None
