import enum
import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    BOOKING_FAILED = "booking_failed"


class PaymentProvider(str, enum.Enum):
    """Which rail actually collects the customer's money. Pesapal covers
    mobile money (M-Pesa) and cards for the East African market; Duffel
    Payments is a card-only alternative that tops up our Duffel Balance
    directly (see external_services/flight.py's create_payment_intent).
    Both converge on the same balance-funded order creation - see
    crud/payments.py's _complete_booking.

    ADMIN is not a real collection rail at all - no customer money moves
    through flyt for it. It marks a booking an admin recorded as already
    paid outside the app (cash, bank transfer, invoice) - see
    crud/payments.py's create_admin_booking. flyt still pays Duffel its
    own balance for the order either way; this only describes how the
    *customer* paid *flyt*."""

    PESAPAL = "pesapal"
    DUFFEL = "duffel"
    ADMIN = "admin"


class Payment(SQLModel, table=True):
    """A checkout attempt for a single flight purchase, paid via either
    Pesapal or Duffel Payments (see `provider`).

    Created before Duffel is ever contacted to create the actual order:
    `order_request_snapshot` holds the exact selected_offers/passengers
    payload to replay to Duffel once payment is confirmed (see
    crud/payments.py's _complete_booking). `booking_id` is only set once
    that replay succeeds.
    """

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    # RESTRICT, not CASCADE - see models/bookings.py's Booking.user_id for
    # the reasoning (account deletion soft-deletes, never hard-deletes,
    # UserInDB; this is the DB-level backstop preserving payment/financial
    # history against a future hard-delete doing it anyway).
    user_id: uuid.UUID = Field(
        foreign_key="userindb.id", index=True, ondelete="RESTRICT"
    )
    booking_id: uuid.UUID | None = Field(
        default=None, foreign_key="booking.id", index=True
    )
    provider: PaymentProvider = Field(default=PaymentProvider.PESAPAL)

    order_request_snapshot: str = Field(
        description="JSON-serialized CheckoutRequest, replayed to Duffel as "
        "an OrderCreate once payment is confirmed"
    )
    amount: str = Field(
        description="What the customer is actually charged via Pesapal - "
        "the re-confirmed live offer price plus flyt's markup (see "
        "utils/pricing.py). Not client-supplied."
    )
    duffel_amount: str | None = Field(
        default=None,
        description="The raw, unmarked-up fare - what Duffel is actually "
        "paid from flyt's balance in finalize_payment. Duffel rejects an "
        "order payment that doesn't exactly match the order's real total, "
        "so this must never be confused with `amount` above.",
    )
    currency: str
    discount_code: str | None = Field(
        default=None,
        description="The DiscountCode.code applied to `amount`, if any "
        "(already folded in when this Payment was created - see "
        "crud/pricing.py's apply_discount). Redeemed (DiscountCode."
        "times_redeemed incremented) only once _complete_booking actually "
        "succeeds, not at checkout-start, so an abandoned checkout never "
        "burns a limited code's redemption count.",
    )

    merchant_reference: str = Field(
        nullable=False, unique=True, index=True, description="Sent to Pesapal as `id`"
    )
    pesapal_order_tracking_id: str | None = Field(default=None, index=True)
    duffel_payment_intent_id: str | None = Field(
        default=None,
        index=True,
        description="Duffel Payments' PaymentIntent id - the card-path "
        "equivalent of pesapal_order_tracking_id above",
    )
    pesapal_status_code: int | None = Field(
        default=None,
        description="Pesapal's status_code: 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED",
    )
    pesapal_confirmation_code: str | None = None
    payment_method: str | None = Field(
        default=None, description="Channel actually used, e.g. 'MpesaKE', 'Visa'"
    )
    payment_account: str | None = Field(
        default=None, description="Masked phone/card used, as Pesapal returns it"
    )
    payment_status_code: str | None = Field(
        default=None,
        description="Pesapal's more specific reason, e.g. "
        "'request_terminated_by_user' - not a fixed enum",
    )

    status: PaymentStatus = Field(default=PaymentStatus.PENDING)
    failure_reason: str | None = Field(
        default=None,
        description="Set on failed/booking_failed - Pesapal's description or "
        "the Duffel error, for support/debugging",
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
