"""Read-only response schemas for OUR persisted bookings
(backend/models/bookings.py, backend/models/flights.py) — distinct from the
raw Duffel API passthrough schemas in duffel_flights.py. Follows SQLModel's
documented Public/Read pattern: table models are never returned directly
from the API, so a plain (non-table) SQLModel subclass reads their
attributes instead.
"""

import uuid
from datetime import date, datetime

from sqlmodel import SQLModel

from backend.models.bookings import BookingStatus, CabinClass, PassengerType
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
    checked_bags: int = 0
    carry_on_bags: int = 0
    tickets: list[TicketPublic] = []


class BookingPublic(SQLModel):
    id: uuid.UUID
    duffel_order_id: str
    booking_reference: str
    status: BookingStatus
    total_amount: str
    total_currency: str
    base_amount: str | None = None
    base_currency: str | None = None
    tax_amount: str | None = None
    tax_currency: str | None = None
    owner_iata_code: str | None = None
    owner_name: str | None = None
    refund_allowed: bool | None = None
    refund_penalty_amount: str | None = None
    refund_penalty_currency: str | None = None
    change_allowed: bool | None = None
    change_penalty_amount: str | None = None
    change_penalty_currency: str | None = None
    created_at: datetime
    cancelled_at: datetime | None = None
    airline_initiated_change_detected_at: datetime | None = None
    slices: list[BookingSlicePublic] = []
    passengers: list[BookingPassengerPublic] = []


class PopularRoute(SQLModel):
    """Aggregated from BookingSlice (crud/bookings.py's
    get_popular_routes) - shared by the staff dashboard
    (routers/admin.py) and the public destinations endpoint
    (routers/flights.py), which differ only in their min_bookings
    threshold, not in shape."""

    origin_iata_code: str
    origin_city_name: str | None = None
    destination_iata_code: str
    destination_city_name: str | None = None
    booking_count: int

    # Unsplash photo for the destination city (crud/destinations.py,
    # scripts/backfill_destination_images.py) - all three are None
    # together whenever no photo has been cached yet, never partially
    # populated. destination_image_attribution_name/_url must be rendered
    # as a visible credit next to the image wherever it's shown, per
    # Unsplash's API guidelines.
    destination_image_url: str | None = None
    destination_image_attribution_name: str | None = None
    destination_image_attribution_url: str | None = None
