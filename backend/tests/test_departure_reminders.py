"""Tests for the pre-departure reminder sweep.

Two things here would be genuinely harmful if wrong, and they're what
most of these cover: sending a reminder at the wrong hour (because
Duffel's departing_at is a local time, not an instant), and sending the
same traveller the same reminder twice (because the sweep runs on a
timer, restarts, and could one day run in two replicas).
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from backend.crud.reminders import (
    LEAD_TIME,
    claim_departure_reminder,
    due_departure_reminders,
    release_departure_reminder,
)
from backend.models.bookings import (
    Booking,
    BookingSlice,
    BookingStatus,
)
from backend.models.flights import Flight
from backend.models.users import UserInDB
from backend.utils.flight_times import departure_instant, local_to_utc

NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)


def _seed(
    session: Session,
    *,
    departing_local: datetime,
    time_zone: str | None = "Africa/Nairobi",
    status: BookingStatus = BookingStatus.CONFIRMED,
    reminded_at: datetime | None = None,
) -> BookingSlice:
    """One confirmed booking with a single NBO→DXB leg departing at
    `departing_local` (local time at Nairobi, exactly as Duffel gives
    it)."""
    user = UserInDB(
        email=f"{uuid.uuid4().hex}@example.com",
        hashed_password="x",
        full_name="Test Traveller",
    )
    session.add(user)
    session.flush()

    booking = Booking(
        user_id=user.id,
        duffel_order_id=f"ord_{uuid.uuid4().hex}",
        booking_reference="JJFWBW",
        status=status,
        total_amount="391.99",
        total_currency="USD",
    )
    session.add(booking)
    session.flush()

    slice_ = BookingSlice(
        booking_id=booking.id,
        duffel_slice_id=f"sli_{uuid.uuid4().hex}",
        origin_iata_code="NBO",
        destination_iata_code="DXB",
        departure_reminder_sent_at=reminded_at,
    )
    session.add(slice_)
    session.flush()

    session.add(
        Flight(
            slice_id=slice_.id,
            duffel_segment_id=f"seg_{uuid.uuid4().hex}",
            origin_iata_code="NBO",
            destination_iata_code="DXB",
            departing_at=departing_local,
            arriving_at=departing_local + timedelta(hours=5),
            origin_time_zone=time_zone,
        )
    )
    session.commit()
    return slice_


@pytest.fixture
def session(sqlite_engine):
    with Session(sqlite_engine) as session:
        yield session


# --- the local-time trap -------------------------------------------------


def test_departing_at_is_read_in_the_airports_zone_not_utc():
    """The whole reason utils/flight_times.py exists. 17:10 in Nairobi is
    14:10 UTC; reading it as UTC would put the reminder three hours out."""
    local = datetime(2026, 9, 15, 17, 10)
    assert local_to_utc(local, "Africa/Nairobi") == datetime(
        2026, 9, 15, 14, 10, tzinfo=timezone.utc
    )


def test_unknown_zone_yields_no_instant_rather_than_a_guess():
    assert local_to_utc(datetime(2026, 9, 15, 17, 10), None) is None
    assert local_to_utc(datetime(2026, 9, 15, 17, 10), "Mars/Olympus_Mons") is None


def test_departure_instant_reads_the_flights_own_zone(session):
    slice_ = _seed(session, departing_local=datetime(2026, 9, 15, 17, 10))
    assert departure_instant(slice_.flights[0]) == datetime(
        2026, 9, 15, 14, 10, tzinfo=timezone.utc
    )


# --- who is due ----------------------------------------------------------


def test_leg_inside_the_lead_time_is_due(session):
    # 14:00 Nairobi == 11:00 UTC... which is in the past. 15:00 Nairobi is
    # 12:00 UTC == NOW, so 17:00 local (14:00 UTC) is two hours out.
    _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))
    assert len(due_departure_reminders(session, NOW)) == 1


def test_leg_beyond_the_lead_time_is_not_due_yet(session):
    # 20:00 Nairobi == 17:00 UTC, five hours out.
    _seed(session, departing_local=datetime(2026, 9, 15, 20, 0))
    assert due_departure_reminders(session, NOW) == []


def test_departed_leg_is_never_due(session):
    """A sweep that was down for a day must not come back up and tell
    people to leave for a flight that has already gone."""
    _seed(session, departing_local=datetime(2026, 9, 15, 13, 0))  # 10:00 UTC
    assert due_departure_reminders(session, NOW) == []


def test_unconfirmed_booking_is_not_due(session):
    _seed(
        session,
        departing_local=datetime(2026, 9, 15, 17, 0),
        status=BookingStatus.PENDING,
    )
    assert due_departure_reminders(session, NOW) == []


def test_already_reminded_leg_is_not_due_again(session):
    _seed(
        session,
        departing_local=datetime(2026, 9, 15, 17, 0),
        reminded_at=NOW - timedelta(minutes=5),
    )
    assert due_departure_reminders(session, NOW) == []


def test_leg_without_a_time_zone_is_skipped_not_guessed(session):
    """Legacy rows have no origin_time_zone. Guessing would mean a
    reminder up to fourteen hours out, possibly after departure."""
    _seed(session, departing_local=datetime(2026, 9, 15, 17, 0), time_zone=None)
    assert due_departure_reminders(session, NOW) == []


def test_a_far_western_departure_is_found_despite_the_naive_band(session):
    """The SQL band is over naive local times, so a zone far from UTC has
    to still fall inside it. 08:00 in Los Angeles is 15:00 UTC - three
    hours out - even though the naive value looks like the past."""
    _seed(
        session,
        departing_local=datetime(2026, 9, 15, 8, 0),
        time_zone="America/Los_Angeles",
    )
    assert len(due_departure_reminders(session, NOW)) == 1


def test_connection_uses_its_first_flight_not_every_segment(session):
    """A leg with a connection has several flights; the reminder is about
    leaving for the airport, so it must be one reminder, keyed on the
    first departure."""
    slice_ = _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))
    session.add(
        Flight(
            slice_id=slice_.id,
            duffel_segment_id="seg_leg2",
            origin_iata_code="DXB",
            destination_iata_code="BKK",
            departing_at=datetime(2026, 9, 15, 23, 30),
            arriving_at=datetime(2026, 9, 16, 8, 0),
            origin_time_zone="Asia/Dubai",
        )
    )
    session.commit()

    due = due_departure_reminders(session, NOW)
    assert len(due) == 1


# --- the claim -----------------------------------------------------------


def test_only_one_sweep_can_claim_a_leg(session):
    """Two sweeps racing - a restarted consumer, a second replica - must
    produce one reminder, not two."""
    slice_ = _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))

    assert claim_departure_reminder(session, slice_.id) is True
    assert claim_departure_reminder(session, slice_.id) is False


def test_claim_removes_the_leg_from_the_next_sweep(session):
    slice_ = _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))
    claim_departure_reminder(session, slice_.id)
    assert due_departure_reminders(session, NOW) == []


def test_releasing_a_failed_claim_lets_the_next_sweep_retry(session):
    """A transient mail failure must not silently cost a traveller their
    only reminder."""
    slice_ = _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))
    claim_departure_reminder(session, slice_.id)

    release_departure_reminder(session, slice_.id)

    assert (
        session.exec(
            select(BookingSlice.departure_reminder_sent_at).where(
                BookingSlice.id == slice_.id
            )
        ).one()
        is None
    )
    assert len(due_departure_reminders(session, NOW)) == 1


def test_lead_time_is_at_least_the_promised_three_hours():
    """The product promise is "at least 3 hours prior" - the sweep's
    interval only ever makes a reminder earlier, never later, so this
    floor is what keeps the promise."""
    assert LEAD_TIME >= timedelta(hours=3)


# --- the sweep end to end ------------------------------------------------


@pytest.fixture
def sweep(monkeypatch, sqlite_engine):
    """Runs the real sweep against the in-memory database, capturing the
    emails instead of sending them. Returns (run, sent) where `sent` is
    the list of (subject, recipients, html) that went out."""
    import backend.workers.reminders as reminders

    sent: list[tuple] = []

    async def _capture(subject, recipients, html, **kwargs):
        sent.append((subject, recipients, html))

    monkeypatch.setattr(reminders, "engine", sqlite_engine)
    monkeypatch.setattr(reminders, "send_html_email_async", _capture)
    monkeypatch.setattr(reminders, "datetime", _FrozenDatetime)
    return reminders.send_due_departure_reminders, sent


class _FrozenDatetime(datetime):
    """Pins the sweep's own clock to NOW; it reads the time itself rather
    than taking it as an argument, since in production nothing else knows
    when the sweep ran."""

    @classmethod
    def now(cls, tz=None):
        return NOW


def test_sweep_emails_the_traveller(session, sweep):
    import asyncio

    run, sent = sweep
    _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))

    assert asyncio.run(run()) == 1
    subject, recipients, html = sent[0]
    assert "JJFWBW" in subject
    assert recipients and "@example.com" in recipients[0]
    # The email's job is to get someone moving and point them at check-in.
    assert "DXB" in html
    assert "check in" in html.lower()


def test_sweep_does_not_email_the_same_leg_twice(session, sweep):
    import asyncio

    run, sent = sweep
    _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))

    assert asyncio.run(run()) == 1
    assert asyncio.run(run()) == 0
    assert len(sent) == 1


def test_sweep_retries_a_leg_whose_email_failed(session, monkeypatch, sqlite_engine):
    """A bounced send must leave the leg claimable again, not consume the
    traveller's only reminder."""
    import asyncio

    import backend.workers.reminders as reminders

    async def _boom(*args, **kwargs):
        raise RuntimeError("smtp is down")

    monkeypatch.setattr(reminders, "engine", sqlite_engine)
    monkeypatch.setattr(reminders, "send_html_email_async", _boom)
    monkeypatch.setattr(reminders, "datetime", _FrozenDatetime)
    _seed(session, departing_local=datetime(2026, 9, 15, 17, 0))

    assert asyncio.run(reminders.send_due_departure_reminders()) == 0
    assert len(due_departure_reminders(session, NOW)) == 1
