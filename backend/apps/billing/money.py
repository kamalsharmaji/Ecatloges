"""Money helpers. Amounts are Decimals with 2 places; providers receive integer minor units."""
from decimal import ROUND_HALF_UP, Decimal

TWO_PLACES = Decimal("0.01")


def q(value) -> Decimal:
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def to_minor(amount: Decimal) -> int:
    """Only 2-decimal currencies are supported (see BILLING_CURRENCIES)."""
    return int((q(amount) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def from_minor(minor: int) -> Decimal:
    return q(Decimal(minor) / 100)


def compute_tax(price: Decimal, *, rate_percent: Decimal, inclusive: bool) -> dict:
    """
    Split a price into subtotal / tax / total.

    - rate 0  → no tax line (the default until tax settings are approved).
    - inclusive → the price already contains tax; tax is extracted from it.
    - exclusive → tax is added on top of the price.
    """
    price = q(price)
    rate = Decimal(rate_percent)
    if rate <= 0:
        return {"subtotal": price, "tax_amount": q(0), "total": price}
    if inclusive:
        subtotal = q(price * 100 / (100 + rate))
        return {"subtotal": subtotal, "tax_amount": price - subtotal, "total": price}
    tax = q(price * rate / 100)
    return {"subtotal": price, "tax_amount": tax, "total": price + tax}
