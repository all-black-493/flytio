import uuid
from datetime import datetime

from pydantic import BaseModel

from backend.models.refunds import RefundStatus


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
