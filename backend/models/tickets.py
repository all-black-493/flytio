import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint

if TYPE_CHECKING:
    from backend.models.bookings import BookingPassenger


class Ticket(SQLModel, table=True):
    """An issued travel document (e-ticket, or an EMD for a service) from a
    booking's Duffel order, parsed from `Order.documents` after payment
    confirms. `booking_passenger_id` is left null when Duffel doesn't
    associate a document with a specific passenger."""

    __table_args__ = (
        # Composite rather than a bare unique on ticket_number: a real IATA
        # e-ticket number is globally unique, but crud/tickets.py's
        # create_tickets_from_order() defensively handles a document with
        # multiple passenger_ids (e.g. a service EMD shared across
        # passengers) by inserting one Ticket row per passenger, all
        # sharing that document's ticket_number - a bare unique constraint
        # would crash booking completion on that (rare, but not
        # impossible) case. All such rows share one booking_id regardless
        # (they all come from one order's one document), so this is still
        # exact enough for a "find the booking this ticket belongs to"
        # lookup.
        UniqueConstraint("ticket_number", "booking_passenger_id"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    booking_id: uuid.UUID = Field(
        foreign_key="booking.id", index=True, ondelete="CASCADE"
    )
    booking_passenger_id: uuid.UUID | None = Field(
        default=None, foreign_key="bookingpassenger.id", index=True
    )

    document_type: str = Field(description="e.g. electronic_ticket")
    ticket_number: str = Field(
        index=True, description="Duffel's document unique_identifier"
    )
    issued_at: datetime = Field(default_factory=datetime.utcnow)

    booking_passenger: "BookingPassenger" = Relationship(back_populates="tickets")
