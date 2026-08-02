import enum
import uuid
from datetime import datetime

from pydantic import BaseModel

from backend.models.refunds import Refund, RefundStatus
from backend.schemas.duffel_orders import OrderCancellationQuote


class RefundRead(BaseModel):
    """Admin-facing view of one customer refund (routers/admin.py)."""

    id: uuid.UUID
    payment_id: uuid.UUID
    booking_id: uuid.UUID | None
    amount: str
    currency: str
    status: RefundStatus
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime


class CustomerRefundStatus(str, enum.Enum):
    """What a traveller is shown, deliberately narrower than the internal
    RefundStatus. failed and manual_required are flyt's problem to fix,
    not something the customer can act on - from their side the money
    simply hasn't arrived yet, which is exactly what `processing` says.
    Surfacing "failed" would alarm someone whose refund is still coming."""

    PROCESSING = "processing"
    PAID = "paid"


class CustomerRefundRead(BaseModel):
    """A traveller's own view of their refund, on their booking page."""

    amount: str
    currency: str
    status: CustomerRefundStatus
    created_at: datetime

    @classmethod
    def from_refund(cls, refund: Refund) -> "CustomerRefundRead":
        return cls(
            amount=refund.amount,
            currency=refund.currency,
            status=(
                CustomerRefundStatus.PAID
                if refund.status == RefundStatus.COMPLETED
                else CustomerRefundStatus.PROCESSING
            ),
            created_at=refund.created_at,
        )


class CancellationRefundPreview(BaseModel):
    """What the *customer* would get if this cancellation is confirmed.

    Deliberately not the same number as the Duffel quote it sits beside:
    that one is what returns to flyt's balance, and it can exceed what
    the customer actually paid once a discount code is involved. Computed
    by crud/refunds.py so this preview and the refund eventually paid can
    never disagree - the frontend renders this rather than doing its own
    arithmetic.
    """

    amount: str
    currency: str
    to_original_payment_method: bool
    manual_payout_reason: str | None = None


class OrderCancellationQuoteResponse(BaseModel):
    """Duffel's cancellation quote plus flyt's own customer-facing figure."""

    data: OrderCancellationQuote
    customer_refund: CancellationRefundPreview
