import uuid

from sqlmodel import Session, select

from backend.external_services.flight import duffel_flight_service
from backend.models.bookings import Booking
from backend.models.tickets import Ticket
from backend.schemas.duffel_orders import Order


def get_ticket_by_number(session: Session, ticket_number: str) -> Ticket | None:
    """Looks up a ticket by its airline-issued number alone, so a
    traveler/support agent can find which booking a ticket belongs to
    without already knowing our internal booking id."""
    return session.exec(
        select(Ticket).where(Ticket.ticket_number == ticket_number)
    ).first()


def list_tickets_for_booking(session: Session, booking_id: uuid.UUID) -> list[Ticket]:
    return list(
        session.exec(select(Ticket).where(Ticket.booking_id == booking_id)).all()
    )


def create_tickets_from_order(
    session: Session, booking: Booking, order: Order
) -> list[Ticket]:
    """Persist issued ticket/EMD documents from a paid Duffel order.

    Associates each document with a BookingPassenger via Duffel's
    `passenger_ids` when present, falling back to an unassociated
    (booking-level) ticket when Duffel doesn't return that association.
    """
    passenger_by_duffel_id = {p.duffel_passenger_id: p for p in booking.passengers}

    tickets = []
    for document in order.documents:
        for duffel_passenger_id in document.passenger_ids or [None]:
            passenger = passenger_by_duffel_id.get(duffel_passenger_id)
            ticket = Ticket(
                booking_id=booking.id,
                booking_passenger_id=passenger.id if passenger else None,
                document_type=document.type,
                ticket_number=document.unique_identifier,
            )
            session.add(ticket)
            tickets.append(ticket)

    session.commit()
    for ticket in tickets:
        session.refresh(ticket)
    return tickets


async def backfill_tickets_from_duffel(
    session: Session, booking: Booking
) -> list[Ticket]:
    """Manually re-checks Duffel for e-tickets on a booking that came out
    of _complete_booking's initial retry window (crud/payments.py) still
    ticket-less - closes that gap on demand (admin action) rather than
    via an automatic background job. No-ops and returns the existing
    tickets if the booking already has any - `create_tickets_from_order`
    isn't itself idempotent (it always inserts), so this is what makes
    it safe for an admin to click more than once."""
    existing = list_tickets_for_booking(session, booking.id)
    if existing:
        return existing
    response = await duffel_flight_service.get_flight_order(booking.duffel_order_id)
    order = Order.model_validate(response["data"])
    return create_tickets_from_order(session, booking, order)
