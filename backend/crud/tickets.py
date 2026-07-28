from sqlmodel import Session, select

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
