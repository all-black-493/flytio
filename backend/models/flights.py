import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.models.bookings import BookingSlice


class Flight(SQLModel, table=True):
    """A single booked flight (segment): one marketing-carrier flight number
    flying between two airports on a specific date/time. A BookingSlice has
    one Flight per leg, or several for a connection."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    slice_id: uuid.UUID = Field(
        foreign_key="bookingslice.id", index=True, ondelete="CASCADE"
    )

    duffel_segment_id: str = Field(nullable=False)

    origin_iata_code: str = Field(nullable=False)
    origin_name: str | None = None
    origin_terminal: str | None = None
    destination_iata_code: str = Field(nullable=False)
    destination_name: str | None = None
    destination_terminal: str | None = None

    departing_at: datetime = Field(nullable=False)
    arriving_at: datetime = Field(nullable=False)
    duration: str | None = Field(
        default=None, description="ISO 8601 duration, e.g. PT7H58M"
    )

    marketing_carrier_iata_code: str | None = None
    marketing_carrier_name: str | None = None
    marketing_carrier_logo_url: str | None = None
    marketing_carrier_flight_number: str | None = None
    operating_carrier_iata_code: str | None = None
    operating_carrier_name: str | None = None
    operating_carrier_flight_number: str | None = None
    aircraft_name: str | None = None

    slice: "BookingSlice" = Relationship(back_populates="flights")
