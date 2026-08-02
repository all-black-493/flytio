"""Unit tests for crud/tickets.py's get_ticket_by_number - backs the new
GET /booking/flight-orders/by-ticket/{ticket_number} lookup (routers/
flights.py), so a traveler can find their booking from a ticket number
alone rather than needing our internal booking id."""

import uuid

import pytest
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.tickets import get_ticket_by_number
from backend.models.bookings import Booking, BookingPassenger, BookingStatus
from backend.models.tickets import Ticket

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _booking_with_ticket(session: Session, ticket_number: str) -> Booking:
    booking = Booking(
        user_id=uuid.uuid4(),
        duffel_order_id=f"ord_{uuid.uuid4().hex[:8]}",
        booking_reference="ABC123",
        status=BookingStatus.CONFIRMED,
        total_amount="100.00",
        total_currency="USD",
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)

    ticket = Ticket(
        booking_id=booking.id,
        document_type="electronic_ticket",
        ticket_number=ticket_number,
    )
    session.add(ticket)
    session.commit()
    return booking


def test_get_ticket_by_number_finds_the_right_booking(session: Session):
    booking = _booking_with_ticket(session, "176-1234567890")

    ticket = get_ticket_by_number(session, "176-1234567890")

    assert ticket is not None
    assert ticket.booking_id == booking.id


def test_get_ticket_by_number_returns_none_when_not_found(session: Session):
    assert get_ticket_by_number(session, "does-not-exist") is None


def test_ticket_numbers_are_unique_per_passenger(session: Session):
    """Same ticket_number for the same passenger twice should conflict -
    the composite unique constraint's actual protected case. (Two tickets
    sharing a number with a *null* booking_passenger_id - Duffel's
    passenger-less-document fallback - do NOT conflict, since SQL never
    treats NULL as equal to NULL for uniqueness; that's an accepted gap,
    not something this constraint is meant to cover.)"""
    booking = _booking_with_ticket(session, "176-1234567890")
    passenger = BookingPassenger(
        booking_id=booking.id,
        duffel_passenger_id="pas_test",
        given_name="Test",
        family_name="Passenger",
    )
    session.add(passenger)
    session.commit()
    session.refresh(passenger)

    session.add(
        Ticket(
            booking_id=booking.id,
            booking_passenger_id=passenger.id,
            document_type="electronic_ticket",
            ticket_number="176-1234567890",
        )
    )
    session.commit()

    session.add(
        Ticket(
            booking_id=booking.id,
            booking_passenger_id=passenger.id,
            document_type="electronic_ticket",
            ticket_number="176-1234567890",
        )
    )
    with pytest.raises(Exception):
        session.commit()
    session.rollback()  # leaves the session usable for the fixture's teardown
