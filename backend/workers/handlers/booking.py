"""Handlers for KafkaTopics.BOOKING_EVENTS (backend/utils/constants.py) -
booking-lifecycle notifications published by routers/bookings.py and
routers/webhooks.py, once the underlying booking mutation has already
committed. Payment-outcome events (booking confirmed/failed after
checkout) live on PAYMENT_EVENTS instead - see handlers/payment.py."""

import uuid
from typing import Any

from sqlmodel import Session

from backend.crud.bookings import get_booking
from backend.crud.db import engine
from backend.crud.notifications import create_notification, notify_staff
from backend.crud.payments import get_completed_payment_for_booking
from backend.crud.refunds import initiate_refund
from backend.models.notifications import NotificationType
from backend.models.refunds import RefundStatus
from backend.models.users import UserInDB
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import airline_change_email_html
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

TOPIC = KafkaTopics.BOOKING_EVENTS


async def _handle_booking_cancelled(data: dict[str, Any]) -> None:
    user_id = uuid.UUID(data["user_id"])
    booking_id = data["booking_id"]
    booking_reference = data["booking_reference"]

    with Session(engine) as session:
        try:
            await create_notification(
                session,
                user_id=user_id,
                type=NotificationType.CANCELLATION_CONFIRMED,
                title=f"Booking {booking_reference} cancelled",
                body="Your cancellation is confirmed and any refund is being processed.",
                link_url=f"/account/bookings/{booking_id}",
            )
        except Exception:
            logger.exception(f"Failed to notify booking {booking_id} cancellation")

        # Independent of the notification above: cancelling the Duffel
        # order refunded flyt's own balance, not the customer, so their
        # money still has to be sent back down Pesapal (crud/refunds.py).
        # Wrapped separately so a failed notification never costs someone
        # their refund, and vice versa.
        try:
            await _refund_cancelled_booking(session, data)
        except Exception:
            logger.exception(
                f"Failed to initiate customer refund for booking {booking_id}"
            )


async def _refund_cancelled_booking(session: Session, data: dict[str, Any]) -> None:
    booking_id = uuid.UUID(data["booking_id"])
    payment = get_completed_payment_for_booking(session, booking_id)
    if payment is None:
        # Nothing was ever collected through flyt for this booking, so
        # there is nothing to send back.
        logger.warning(
            "No completed payment found for cancelled booking %s - no refund to make",
            booking_id,
        )
        return

    refund = await initiate_refund(
        session,
        payment=payment,
        booking_id=booking_id,
        duffel_refund_amount=data.get("duffel_refund_amount"),
    )
    if refund is not None and refund.status == RefundStatus.MANUAL_REQUIRED:
        # Real money is owed that Pesapal's API can't move - most often a
        # partial refund on M-Pesa, which it only allows in full. Staff
        # have to pay this one out by hand, so it must be surfaced rather
        # than left sitting in a table nobody watches.
        try:
            await notify_staff(
                session,
                type=NotificationType.BOOKING_FAILED,
                title=f"Manual refund needed: {refund.amount} {refund.currency}",
                body=f"Booking {data['booking_reference']} was cancelled but its "
                f"refund can't go through Pesapal. {refund.failure_reason}",
                link_url="/admin/refunds",
            )
        except Exception:
            logger.exception("Failed to notify staff of manual refund %s", refund.id)


async def _handle_booking_change_confirmed(data: dict[str, Any]) -> None:
    user_id = uuid.UUID(data["user_id"])
    booking_id = data["booking_id"]
    booking_reference = data["booking_reference"]

    with Session(engine) as session:
        try:
            await create_notification(
                session,
                user_id=user_id,
                type=NotificationType.CHANGE_CONFIRMED,
                title=f"Booking {booking_reference} updated",
                body="Your flight change has been confirmed.",
                link_url=f"/account/bookings/{booking_id}",
            )
        except Exception:
            logger.exception(
                f"Failed to notify booking {booking_id} change confirmation"
            )


async def _handle_airline_change_detected(data: dict[str, Any]) -> None:
    booking_id = uuid.UUID(data["booking_id"])
    user_id = uuid.UUID(data["user_id"])

    with Session(engine) as session:
        booking = get_booking(session, booking_id)
        if booking is None:
            logger.error(
                f"Booking {booking_id} not found for airline_change_detected event"
            )
            return

        user = session.get(UserInDB, user_id)
        if user:
            try:
                await send_html_email_async(
                    f"Your flight {booking.booking_reference} may have changed",
                    [user.email],
                    airline_change_email_html(booking),
                    from_address=SENDER_BOOKINGS,
                )
            except Exception:
                logger.exception(
                    f"Failed to send airline-change email for booking {booking_id}"
                )

        try:
            await create_notification(
                session,
                user_id=user_id,
                type=NotificationType.AIRLINE_CHANGE,
                title=f"Booking {booking.booking_reference} may have changed",
                body=f"{booking.owner_name or 'The airline'} made a change to your itinerary.",
                link_url=f"/account/bookings/{booking_id}",
            )
        except Exception:
            logger.exception(
                f"Failed to create airline-change notification for booking {booking_id}"
            )


HANDLERS = {
    KafkaEventTypes.BOOKING_CANCELLED: _handle_booking_cancelled,
    KafkaEventTypes.BOOKING_CHANGE_CONFIRMED: _handle_booking_change_confirmed,
    KafkaEventTypes.AIRLINE_CHANGE_DETECTED: _handle_airline_change_detected,
}
