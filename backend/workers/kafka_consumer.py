"""Long-running consumer for the events published by utils/kafka.py -
the other half of the fire-and-forget producer. Runs as its own process
(see compose.yaml's kafka-consumer service), never imported by the
FastAPI app itself:

    python -m backend.workers.kafka_consumer

Add a new event by writing a handler and registering it in
EVENT_HANDLERS - subscribed topics are derived from that registry, so a
new topic only needs adding to KafkaTopics/KafkaEventTypes and a handler
here, not a third place.
"""

from __future__ import annotations

import asyncio
import json
import signal
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from confluent_kafka import Consumer
from sqlmodel import Session

from backend.config import settings
from backend.crud.bookings import get_booking
from backend.crud.db import engine
from backend.crud.notifications import create_notification, notify_staff
from backend.models.notifications import NotificationType
from backend.models.users import UserInDB
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.email import (
    SENDER_BOOKINGS,
    SENDER_SUPPORT,
    SENDER_TRANSACTIONAL,
    SENDER_WELCOME,
    send_email_async,
    send_html_email_async,
)
from backend.utils.email_templates import (
    airline_change_email_html,
    booking_confirmation_email_html,
    support_autoreply_email_html,
    support_request_email_html,
)
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

CONSUMER_GROUP_ID = "flyt-backend-workers"


async def _handle_user_registered(data: dict[str, Any]) -> None:
    email = data["email"]
    subject = "Welcome to flyt!"
    body_text = (
        f"Hello {email},\n\nThank you for registering with us. We are excited "
        f"to have you on board!"
    )
    await send_email_async(subject, [email], body_text, from_address=SENDER_WELCOME)


async def _handle_support_request_received(data: dict[str, Any]) -> None:
    name = data["name"]
    email = data["email"]
    subject = data["subject"]
    message = data["message"]
    booking_reference = data.get("booking_reference")

    await send_html_email_async(
        f"Support: {subject}",
        [SENDER_SUPPORT],
        support_request_email_html(name, email, subject, message, booking_reference),
        from_address=SENDER_TRANSACTIONAL,
        reply_to=email,
    )
    await send_html_email_async(
        "We've received your message",
        [email],
        support_autoreply_email_html(name, subject),
        from_address=SENDER_SUPPORT,
    )
    # A fresh session per event, not a shared/module-level one - this
    # process handles events one at a time on a single thread, but a
    # long-lived session would still accumulate stale identity-map state
    # across unrelated events over the worker's lifetime.
    # notify_staff/create_notification commit per-row internally (see
    # crud/notifications.py) - no explicit commit needed here.
    with Session(engine) as session:
        await notify_staff(
            session,
            type=NotificationType.SUPPORT_REQUEST,
            title=f"New support request: {subject}",
            body=f"Booking reference: {booking_reference}"
            if booking_reference
            else None,
            link_url="/admin",
        )


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


# One handler per event_type - the topics subscribed to below are derived
# from this registry's keys via KafkaEventTypes, so adding an event only
# means adding it here.
EVENT_HANDLERS: dict[str, Callable[[dict[str, Any]], Awaitable[None]]] = {
    KafkaEventTypes.USER_REGISTERED: _handle_user_registered,
    KafkaEventTypes.SUPPORT_REQUEST_RECEIVED: _handle_support_request_received,
    KafkaEventTypes.BOOKING_CONFIRMED: _handle_booking_confirmed,
    KafkaEventTypes.BOOKING_FAILED: _handle_booking_failed,
    KafkaEventTypes.DISCOUNT_REDEMPTION_FAILED: _handle_discount_redemption_failed,
    KafkaEventTypes.BOOKING_CANCELLED: _handle_booking_cancelled,
    KafkaEventTypes.BOOKING_CHANGE_CONFIRMED: _handle_booking_change_confirmed,
    KafkaEventTypes.AIRLINE_CHANGE_DETECTED: _handle_airline_change_detected,
}

SUBSCRIBED_TOPICS = [
    KafkaTopics.USER_EVENTS,
    KafkaTopics.SUPPORT_EVENTS,
    KafkaTopics.BOOKING_EVENTS,
]


def _build_consumer() -> Consumer:
    return Consumer(
        {
            "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
            "group.id": CONSUMER_GROUP_ID,
            "auto.offset.reset": "earliest",
            # Committed explicitly after a message's handler has run
            # (success or logged failure) rather than on a timer, so a
            # crash mid-handler re-delivers the message instead of
            # silently skipping it.
            "enable.auto.commit": False,
        }
    )


def main() -> None:
    consumer = _build_consumer()
    consumer.subscribe(SUBSCRIBED_TOPICS)

    running = True

    def _stop(signum, _frame):
        nonlocal running
        logger.info(f"Received signal {signum}, shutting down consumer")
        running = False

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    logger.info(f"Kafka consumer started, subscribed to {SUBSCRIBED_TOPICS}")
    try:
        while running:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error(f"Consumer error: {msg.error()}")
                continue

            try:
                envelope = json.loads(msg.value().decode("utf-8"))
                event_type = envelope.get("event_type")
                handler = EVENT_HANDLERS.get(event_type)
                if handler is None:
                    logger.warning(
                        f"No handler for event_type={event_type!r}, skipping"
                    )
                else:
                    asyncio.run(handler(envelope.get("data", {})))
            except Exception as e:
                # Logged and committed past, not retried forever - matches
                # the previous BackgroundTasks behavior, where a failed
                # side effect (email, notification) never blocked or
                # retried against the original request.
                logger.error(f"Failed to process message from {msg.topic()}: {e}")

            consumer.commit(msg)
    finally:
        consumer.close()
        logger.info("Kafka consumer stopped")


if __name__ == "__main__":
    main()
