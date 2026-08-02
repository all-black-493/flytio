import enum
import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class RefundStatus(str, enum.Enum):
    """Pesapal never tells us a refund actually landed - its
    RefundRequest returns "received, pending our finance team's
    approval", with no webhook or status endpoint afterwards (unlike a
    payment, which has GetTransactionStatus). So REQUESTED is as far as
    this app can get on its own; COMPLETED only ever comes from a human
    marking it so in the admin UI after reconciling."""

    REQUESTED = "requested"
    FAILED = "failed"
    MANUAL_REQUIRED = "manual_required"
    COMPLETED = "completed"


class Refund(SQLModel, table=True):
    """Money owed back to a customer after their booking was cancelled.

    Separate from the airline refund: flyt pays Duffel from its own
    Duffel balance, so cancelling an order credits *flyt's balance*, not
    the customer. Returning the customer's money is an independent
    movement back down the rail they actually paid on (Pesapal) - this
    row tracks that leg.
    """

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    # Unique, not just indexed: Pesapal permits exactly one refund per
    # payment (see its RefundRequest docs), so the DB enforces that same
    # rule. It doubles as the idempotency guard for the Kafka consumer
    # that creates these - at-least-once delivery means a redelivered
    # booking_cancelled event would otherwise refund a customer twice.
    payment_id: uuid.UUID = Field(
        foreign_key="payment.id", unique=True, index=True, ondelete="RESTRICT"
    )
    booking_id: uuid.UUID | None = Field(
        default=None, foreign_key="booking.id", index=True
    )

    amount: str = Field(
        description="What the customer gets back, in `currency`. Duffel's "
        "own refund (the raw fare minus any airline penalty) passed "
        "straight through - flyt keeps its markup, which covers the "
        "Pesapal processing fee that isn't returned on a refund. Capped "
        "at what the customer actually paid, since a discount code can "
        "leave the raw fare higher than the charged amount."
    )
    currency: str

    status: RefundStatus = Field(default=RefundStatus.REQUESTED)
    failure_reason: str | None = Field(
        default=None,
        description="Why Pesapal rejected it, or why it needs a manual "
        "payout - shown to staff in the admin refund list.",
    )
    pesapal_confirmation_code: str | None = Field(
        default=None,
        description="The original payment's confirmation code, which is "
        "what Pesapal's RefundRequest identifies the transaction by (not "
        "our merchant_reference or their order_tracking_id).",
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
