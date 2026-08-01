"""Handlers for KafkaTopics.PAYMENT_EVENTS (backend/utils/constants.py) -
published by crud/payments.py's _publish_booking_completion_events,
after its own session.commit()."""

import uuid
from typing import Any

from sqlmodel import Session

from backend.crud.bookings import get_booking
from backend.crud.db import engine
from backend.crud.notifications import create_notification, notify_staff
from backend.models.notifications import NotificationType
from backend.models.users import UserInDB
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import booking_confirmation_email_html
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

TOPIC = KafkaTopics.PAYMENT_EVENTS


async def _handle_booking_confirmed(data: dict[str, Any]) -> None:
    booking_id = uuid.UUID(data["booking_id"])
    user_id = uuid.UUID(data["user_id"])

    with Session(engine) as session:
        booking = get_booking(session, booking_id)
        if booking is None:
            # Shouldn't happen - crud/payments.py only publishes this after
            # its own session.commit() - but the row is gone/unreachable
            # for some other reason, so there's nothing to email/notify
            # about.
            logger.error(f"Booking {booking_id} not found for booking_confirmed event")
            return

        user = session.get(UserInDB, user_id)
        if user:
            try:
                await send_html_email_async(
                    f"You're booked! Reference {booking.booking_reference}",
                    [user.email],
                    booking_confirmation_email_html(booking),
                    from_address=SENDER_BOOKINGS,
                )
            except Exception:
                logger.exception(
                    f"Failed to send confirmation email for booking {booking_id}"
                )

        try:
            await create_notification(
                session,
                user_id=user_id,
                type=NotificationType.BOOKING_CONFIRMED,
                title=f"Booking {booking.booking_reference} confirmed",
                body="Your flight is booked and your e-ticket is on its way.",
                link_url=f"/account/bookings/{booking_id}",
            )
        except Exception:
            logger.exception(
                f"Failed to create booking-confirmed notification for booking {booking_id}"
            )


async def _handle_booking_failed(data: dict[str, Any]) -> None:
    payment_id = data["payment_id"]
    user_id = uuid.UUID(data["user_id"])
    failure_reason = data.get("failure_reason") or "Unknown error"

    with Session(engine) as session:
        try:
            await create_notification(
                session,
                user_id=user_id,
                type=NotificationType.BOOKING_FAILED,
                title="We couldn't complete your booking",
                body="Your payment went through, but we hit a problem finalizing "
                "your flight. Our team has been notified and will follow up shortly.",
                link_url="/account",
            )
        except Exception:
            logger.exception(
                f"Failed to notify customer of booking failure for payment {payment_id}"
            )

        try:
            await notify_staff(
                session,
                type=NotificationType.BOOKING_FAILED,
                title=f"Booking failed after payment collected (payment {payment_id})",
                body=failure_reason,
                link_url="/admin/bookings",
            )
        except Exception:
            logger.exception(
                f"Failed to notify staff of booking failure for payment {payment_id}"
            )


async def _handle_discount_redemption_failed(data: dict[str, Any]) -> None:
    payment_id = data["payment_id"]
    discount_code = data.get("discount_code")

    with Session(engine) as session:
        await notify_staff(
            session,
            type=NotificationType.DISCOUNT_REDEMPTION_FAILED,
            title=f"Discount code {discount_code} redemption failed",
            body=f"Payment {payment_id} succeeded but incrementing "
            f"times_redeemed failed - the code's usage count may "
            f"undercount actual redemptions.",
            link_url="/admin/pricing",
        )


HANDLERS = {
    KafkaEventTypes.BOOKING_CONFIRMED: _handle_booking_confirmed,
    KafkaEventTypes.BOOKING_FAILED: _handle_booking_failed,
    KafkaEventTypes.DISCOUNT_REDEMPTION_FAILED: _handle_discount_redemption_failed,
}
