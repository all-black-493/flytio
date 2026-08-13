"""Finding and claiming the legs that are due a departure reminder.

Split from the sending itself (workers/reminders.py) so the "which legs,
and who gets to send them" question is testable against a database
without a mail server, and so the sweep's one piece of real concurrency
control lives somewhere obvious.
"""

import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select, update

from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.flights import Flight
from backend.utils.flight_times import departure_instant
from backend.utils.log_manager import get_app_logger
from backend.utils.time import utcnow

logger = get_app_logger(__name__)

# How far ahead of departure a traveller is told to get moving. The user's
# requirement is "at least 3 hours prior", so this is a floor: the sweep
# runs on an interval, so a reminder lands somewhere in
# [LEAD_TIME, LEAD_TIME + sweep interval] before departure, never later.
LEAD_TIME = timedelta(hours=3)

# The widest band of naive local departure times that could possibly map
# into the reminder window, given real UTC offsets run from -12 to +14.
# A leg is pulled out of the database by this coarse band and then checked
# exactly, in Python, against its own zone - SQL can't do the conversion
# because the zone lives on the row.
_MAX_UTC_OFFSET = timedelta(hours=14)
_MIN_UTC_OFFSET = timedelta(hours=-12)


def due_departure_reminders(
    session: Session, now: datetime
) -> list[tuple[Booking, BookingSlice]]:
    """Every (booking, leg) whose first flight departs within LEAD_TIME of
    `now` and hasn't been reminded yet.

    Legs already departed are excluded: a sweep that was down for a day
    must not come back up and tell people to head to an airport they
    should have left from yesterday.
    """
    first_flights = (
        session.exec(
            select(Booking, BookingSlice, Flight)
            .join(BookingSlice, BookingSlice.booking_id == Booking.id)
            .join(Flight, Flight.slice_id == BookingSlice.id)
            .where(Booking.status == BookingStatus.CONFIRMED)
            .where(BookingSlice.departure_reminder_sent_at.is_(None))
            .where(Flight.departing_at >= now.replace(tzinfo=None) + _MIN_UTC_OFFSET)
            .where(
                Flight.departing_at
                <= now.replace(tzinfo=None) + LEAD_TIME + _MAX_UTC_OFFSET
            )
            .order_by(BookingSlice.id, Flight.departing_at)
        )
        .unique()
        .all()
    )

    # A connection has several flights in the band; the reminder is about
    # leaving for the airport, so only the first one counts. The ORDER BY
    # above means the first row seen for a slice is its earliest flight.
    seen: set[uuid.UUID] = set()
    due: list[tuple[Booking, BookingSlice]] = []
    for booking, slice_, flight in first_flights:
        if slice_.id in seen:
            continue
        seen.add(slice_.id)

        departs_at = departure_instant(flight)
        if departs_at is None:
            logger.warning(
                "Skipping departure reminder for slice %s: flight %s has no "
                "origin time zone, so its departure instant is unknown",
                slice_.id,
                flight.id,
            )
            continue
        if now < departs_at <= now + LEAD_TIME:
            due.append((booking, slice_))
    return due


def claim_departure_reminder(session: Session, slice_id: uuid.UUID) -> bool:
    """Stamps a leg as reminded, returning whether this caller is the one
    that got it.

    The claim happens BEFORE the email is sent, and conditionally on the
    column still being NULL, so two sweeps racing over the same leg can
    only ever produce one winner - the loser's UPDATE matches no rows.
    Committed immediately for the same reason: an uncommitted claim isn't
    visible to the other sweep, which is the whole point.
    """
    result = session.exec(
        update(BookingSlice)
        .where(BookingSlice.id == slice_id)
        .where(BookingSlice.departure_reminder_sent_at.is_(None))
        .values(departure_reminder_sent_at=utcnow())
    )
    session.commit()
    return result.rowcount == 1


def release_departure_reminder(session: Session, slice_id: uuid.UUID) -> None:
    """Gives a claimed leg back after the send failed, so the next sweep
    retries it. Without this a transient SMTP error would silently cost a
    traveller their only reminder - the claim would stand forever with
    nothing ever having been delivered."""
    session.exec(
        update(BookingSlice)
        .where(BookingSlice.id == slice_id)
        .values(departure_reminder_sent_at=None)
    )
    session.commit()
