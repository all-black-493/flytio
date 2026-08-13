"""Turns Duffel's flight times into instants.

Duffel returns `departing_at`/`arriving_at` as LOCAL times at their own
airport, with no offset: a Nairobi departure comes back as
"2026-09-15T17:10:00", meaning 17:10 in Nairobi. Everywhere the app only
displays those (the ticket, the PDF, the confirmation email) that's
exactly what a traveller wants and no conversion is needed.

Anything that compares a flight time to *now* is a different problem, and
getting it wrong is not cosmetic - a departure reminder computed against
a naive local time would fire up to fourteen hours early or late, and
"your flight leaves in 3 hours" sent after the plane left is worse than
sending nothing. So conversion lives here, in one place, and it refuses
to guess.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


def local_to_utc(local: datetime, time_zone: str | None) -> datetime | None:
    """The UTC instant `local` refers to when read in `time_zone`, or None
    if that can't be known.

    None is returned - rather than a plausible-looking fallback - when the
    zone is missing (a flight booked before origin_time_zone was
    persisted) or unrecognised by the host's tz database. A caller that
    can't get an instant must skip the flight, not schedule off a guess.
    """
    if not time_zone:
        return None
    try:
        zone = ZoneInfo(time_zone)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Unknown IANA time zone %r from Duffel", time_zone)
        return None

    if local.tzinfo is not None:
        return local.astimezone(timezone.utc)
    return local.replace(tzinfo=zone).astimezone(timezone.utc)


def departure_instant(flight) -> datetime | None:
    """When `flight` actually departs, in UTC - None if unknowable. Takes
    any object with `departing_at`/`origin_time_zone` (models/flights.py's
    Flight, and the fixtures that stand in for it)."""
    return local_to_utc(flight.departing_at, flight.origin_time_zone)
