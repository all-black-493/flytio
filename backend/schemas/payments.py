"""Flyt's own payment API schemas - distinct from Pesapal's wire format
(schemas/pesapal.py), same split as duffel_orders.py (vendor) vs
bookings.py (ours).
"""

import uuid

from sqlmodel import Field, SQLModel

from backend.models.payments import PaymentStatus
from backend.schemas.bookings import BookingPublic
from backend.schemas.duffel_orders import OrderPassenger


class CheckoutRequest(SQLModel):
    """Starts a purchase. Deliberately excludes payment details - unlike
    Duffel's OrderCreate, no `payments` field, since payment is collected
    by Pesapal, not supplied by the client."""

    selected_offers: list[str] = Field(
        min_length=1, max_length=1, description="A single offer ID to book"
    )
    passengers: list[OrderPassenger] = Field(min_length=1)
    discount_code: str | None = Field(
        default=None,
        description="Validated and applied server-side (crud/pricing.py) "
        "- never trust a client-computed discounted amount. Not used by "
        "admin-created bookings (routers/admin.py's create_admin_booking_"
        "route), which never collects real payment in the first place.",
    )


class CheckoutResponse(SQLModel):
    payment_id: uuid.UUID
    redirect_url: str = Field(description="Send the browser here to complete payment")


class CardCheckoutResponse(SQLModel):
    payment_id: uuid.UUID
    client_token: str = Field(
        description="Passed to the DuffelPayments React component to collect "
        "card details directly with Duffel - never touches our backend"
    )


class DiscountPreviewRequest(SQLModel):
    """POST /discounts/preview - a lightweight, non-persisting check so
    the customer sees whether a code works (and roughly what it saves)
    before committing to checkout. Deliberately doesn't take the full
    CheckoutRequest (passengers/seats/baggage) - it previews the base
    fare's discount only; the real checkout call re-validates and applies
    the code against the actual final total, which is what's authoritative."""

    offer_id: str
    discount_code: str


class DiscountPreviewResponse(SQLModel):
    original_amount: str = Field(
        description="Base fare with the current markup, no discount"
    )
    discounted_amount: str
    currency: str
    discount_percentage: float


class PaymentStatusResponse(SQLModel):
    id: uuid.UUID
    status: PaymentStatus
    booking_id: uuid.UUID | None = None
    failure_reason: str | None = None
    booking: BookingPublic | None = Field(
        default=None,
        description="Populated once status is completed - avoids a second "
        "round-trip from the payment-callback page",
    )
