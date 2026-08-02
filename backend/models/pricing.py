"""Admin-managed pricing overrides on top of utils/pricing.py's default
7% MARKUP_RATE - a time-bounded sale (PricingSale) that replaces the
rate for everyone automatically, and a percentage-off DiscountCode a
customer redeems at checkout. See utils/pricing.py's
get_active_markup_rate/apply_discount for how these get applied, and
crud/pricing.py for how they're created/validated/redeemed.
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class PricingSale(SQLModel, table=True):
    """A scheduled markup override - e.g. "Black Friday 2026", 3% instead
    of the default 7%, active only for [starts_at, ends_at]. Creating one
    checks for overlap with every existing sale (crud/pricing.py's
    create_pricing_sale) so there's never ambiguity about which rate is
    active at a given moment."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    markup_rate: float = Field(
        description="e.g. 0.03 for 3% - replaces utils/pricing.py's "
        "MARKUP_RATE while active"
    )
    starts_at: datetime
    ends_at: datetime
    created_by_user_id: uuid.UUID = Field(foreign_key="userindb.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DiscountCode(SQLModel, table=True):
    """A percentage-off code a customer types at checkout
    (schemas/payments.py's CheckoutRequest.discount_code). Percentage-only
    - a flat amount would need a currency attached and wouldn't apply
    across flyt's multi-currency bookings, so that's deliberately not
    supported. `code` is always stored/looked-up uppercased
    (crud/pricing.py normalizes it) so "flyt10" and "FLYT10" are the same
    code."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, index=True)
    discount_percentage: float = Field(description="e.g. 10 for 10% off")
    max_redemptions: int | None = Field(
        default=None, description="None means unlimited"
    )
    times_redeemed: int = Field(default=0)
    expires_at: datetime | None = Field(default=None)
    is_active: bool = Field(default=True)
    created_by_user_id: uuid.UUID = Field(foreign_key="userindb.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
