"""Read-only response schemas for OUR persisted bookings
(backend/models/bookings.py, backend/models/flights.py) — distinct from the
raw Duffel API passthrough schemas in duffel_flights.py. Follows SQLModel's
documented Public/Read pattern: table models are never returned directly
from the API, so a plain (non-table) SQLModel subclass reads their
attributes instead.
"""

import uuid
from datetime import date, datetime

from sqlmodel import Field, SQLModel

from backend.models.bookings import BookingStatus, CabinClass, PassengerType
from backend.schemas.common import PaginationMeta
from backend.schemas.tickets import TicketPublic


class FlightPublic(SQLModel):
    id: uuid.UUID
    duffel_segment_id: str
    origin_iata_code: str
    origin_name: str | None = None
    origin_terminal: str | None = None
    destination_iata_code: str
    destination_name: str | None = None
    destination_terminal: str | None = None
    departing_at: datetime
    arriving_at: datetime
    duration: str | None = None
    marketing_carrier_iata_code: str | None = None
    marketing_carrier_name: str | None = None
    marketing_carrier_logo_url: str | None = None
    marketing_carrier_flight_number: str | None = None
    operating_carrier_iata_code: str | None = None
    operating_carrier_name: str | None = None
    operating_carrier_flight_number: str | None = None
    aircraft_name: str | None = None


class BookingSlicePublic(SQLModel):
    id: uuid.UUID
    duffel_slice_id: str
    origin_iata_code: str
    origin_name: str | None = None
    origin_city_name: str | None = None
    destination_iata_code: str
    destination_name: str | None = None
    destination_city_name: str | None = None
    duration: str | None = None
    flights: list[FlightPublic] = []


class BookingPassengerPublic(SQLModel):
    id: uuid.UUID
    duffel_passenger_id: str
    passenger_type: PassengerType | None = None
    given_name: str
    family_name: str
    born_on: date | None = None
    email: str | None = None
    phone_number: str | None = None
    seat_designator: str | None = None
    cabin_class: CabinClass | None = None
    tickets: list[TicketPublic] = []


class BookingPublic(SQLModel):
    id: uuid.UUID
    duffel_order_id: str
    booking_reference: str
    status: BookingStatus
    total_amount: str
    total_currency: str
    owner_iata_code: str | None = None
    owner_name: str | None = None
    created_at: datetime
    cancelled_at: datetime | None = None
    slices: list[BookingSlicePublic] = []
    passengers: list[BookingPassengerPublic] = []


class BookingListQueryParams(SQLModel):
    """Query params for listing the current user's bookings from our own
    DB (not Duffel's cursor-paginated /air/orders), so plain offset/limit
    pagination is used instead of Duffel's opaque before/after cursors."""

    booking_reference: str | None = None
    origin: str | None = Field(default=None, min_length=3, max_length=3)
    destination: str | None = Field(default=None, min_length=3, max_length=3)
    status: BookingStatus | None = None
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class BookingListResponse(SQLModel):
    data: list[BookingPublic]
    meta: PaginationMeta
