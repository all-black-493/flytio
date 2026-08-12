"""The departure-reminder sweep: emails and notifies every traveller whose
flight leaves within crud/reminders.py's LEAD_TIME.

This is time-triggered, not event-triggered, which is why it doesn't live
in workers/handlers/ with the Kafka event handlers - nothing *happens*
three hours before a flight, the clock just reaches it. It runs as a tick
inside the consumer's poll loop (workers/kafka_consumer.py) rather than
under a separate scheduler, because that loop is already the one
long-running process this app owns; adding Celery beat or a cron
container to send one email would be a lot of infrastructure for it.

Safe to run concurrently: each leg is claimed with a conditional UPDATE
before anything is sent, so a second sweep finds nothing to do.
"""

from datetime import datetime, timezone

from sqlmodel import Session

from backend.crud.db import engine
from backend.crud.notifications import create_notification
from backend.crud.reminders import (
    LEAD_TIME,
    claim_departure_reminder,
    due_departure_reminders,
    release_departure_reminder,
)
from backend.models.bookings import Booking, BookingSlice
from backend.models.notifications import NotificationType
from backend.models.users import UserInDB
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import departure_reminder_email_html
from backend.utils.flight_times import departure_instant
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


def _hours_until(slice_: BookingSlice, now: datetime) -> int:
    """Whole hours to departure, for the email's headline. Rounded rather
    than floored so a leg 2h50m out reads "about 3 hours" instead of
    "about 2", and floored at 1 so it can never say "in 0 hours"."""
    departs_at = departure_instant(slice_.flights[0])
    if departs_at is None:
        return int(LEAD_TIME.total_seconds() // 3600)
    return max(1, round((departs_at - now).total_seconds() / 3600))


async def _send_departure_reminder(
    session: Session, booking: Booking, slice_: BookingSlice, now: datetime
) -> None:
    user = session.get(UserInDB, booking.user_id)
    if user is None:
        logger.error(
            "Booking %s has no user - cannot send departure reminder", booking.id
        )
        return

    await send_html_email_async(
        f"Your flight to {slice_.destination_city_name or slice_.destination_iata_code}"
        f" leaves soon - {booking.booking_reference}",
        [user.email],
        departure_reminder_email_html(booking, slice_, _hours_until(slice_, now)),
        from_address=SENDER_BOOKINGS,
    )

    # In-app too, not just email: the email is the one that reaches someone
    # who isn't on the site, but the bell is what they see if they are.
    # Wrapped so a notification failure doesn't undo a delivered email.
    try:
        await create_notification(
            session,
            user_id=booking.user_id,
            type=NotificationType.DEPARTURE_REMINDER,
            title=f"{slice_.origin_iata_code} → {slice_.destination_iata_code} departs soon",
            body="Check in with the airline and head for the airport.",
            link_url=f"/account/bookings/{booking.id}",
        )
    except Exception:
        logger.exception(
            "Failed to create departure-reminder notification for booking %s",
            booking.id,
        )


async def send_due_departure_reminders() -> int:
    """One sweep. Returns how many legs were reminded, for the caller's
    logs.

    Each leg is isolated: one traveller's bad email address must not stop
    the rest of that sweep's reminders from going out.
    """
    now = datetime.now(timezone.utc)
    sent = 0

    with Session(engine) as session:
        for booking, slice_ in due_departure_reminders(session, now):
            if not claim_departure_reminder(session, slice_.id):
                # Another sweep got there first.
                continue
            try:
                await _send_departure_reminder(session, booking, slice_, now)
                sent += 1
            except Exception:
                logger.exception(
                    "Failed to send departure reminder for booking %s slice %s - "
                    "releasing the claim so the next sweep retries",
                    booking.id,
                    slice_.id,
                )
                release_departure_reminder(session, slice_.id)

    if sent:
        logger.info("Sent %d departure reminder(s)", sent)
    return sent
