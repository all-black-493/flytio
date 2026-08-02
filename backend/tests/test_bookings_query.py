"""Tests for crud/bookings.py's user_bookings_query - the statement
behind GET /booking/flight-orders, handed to fastapi-pagination rather
than executed in the crud layer.

Both properties tested here are things the cursor-pagination migration
depends on: a booking must appear once per page (the origin/destination
filters join BookingSlice, which can multiply rows), and the ordering
must be a total order (keyset paging seeks into the sort key itself, so
a tie makes a cursor's position ambiguous).
"""

import uuid
from datetime import datetime

from sqlmodel import Session

from backend.crud.bookings import user_bookings_query
from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.users import UserInDB


def _user(session: Session) -> UserInDB:
    user = UserInDB(email=f"traveller-{uuid.uuid4().hex[:8]}@example.com", password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _booking(session: Session, user: UserInDB, *, created_at: datetime, **kwargs):
    booking = Booking(
        user_id=user.id,
        duffel_order_id=f"ord_{uuid.uuid4().hex[:10]}",
        booking_reference=kwargs.pop("booking_reference", uuid.uuid4().hex[:6].upper()),
        status=BookingStatus.CONFIRMED,
        total_amount="100.00",
        total_currency="USD",
        created_at=created_at,
        **kwargs,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def _slice(session: Session, booking: Booking, origin: str, destination: str):
    session.add(
        BookingSlice(
            booking_id=booking.id,
            duffel_slice_id=f"sli_{uuid.uuid4().hex[:10]}",
            origin_iata_code=origin,
            destination_iata_code=destination,
        )
    )
    session.commit()


def test_origin_filter_returns_a_matching_booking_only_once(sqlite_engine):
    """A round trip NBO->MBA->NBO has two slices departing NBO. The
    origin filter joins BookingSlice, so without .distinct() this
    booking comes back twice - once per matching slice - which on a
    cursor-paginated list means a duplicate row in the traveller's list."""
    with Session(sqlite_engine) as session:
        user = _user(session)
        booking = _booking(session, user, created_at=datetime(2026, 7, 1, 12, 0))
        _slice(session, booking, "NBO", "MBA")
        _slice(session, booking, "NBO", "KIS")

        rows = session.exec(user_bookings_query(user.id, origin="NBO")).all()

        assert [b.id for b in rows] == [booking.id]


def test_ordering_breaks_created_at_ties_by_id(sqlite_engine):
    """Keyset pagination walks the sort key, so it has to be a total
    order. With a shared created_at, created_at alone leaves the order
    undefined; the id tiebreaker makes it deterministic and repeatable."""
    with Session(sqlite_engine) as session:
        user = _user(session)
        shared = datetime(2026, 7, 1, 12, 0)
        bookings = [_booking(session, user, created_at=shared) for _ in range(5)]

        ordered = [b.id for b in session.exec(user_bookings_query(user.id)).all()]

        assert len(ordered) == len(bookings)
        assert ordered == sorted((b.id for b in bookings), reverse=True)
        # Same statement, same rows, same order - a second read must not
        # shuffle, or a cursor issued on one page would land elsewhere.
        assert ordered == [
            b.id for b in session.exec(user_bookings_query(user.id)).all()
        ]
