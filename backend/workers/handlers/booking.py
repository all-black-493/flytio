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
from backend.crud.notifications import create_notification
from backend.models.notifications import NotificationType
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
