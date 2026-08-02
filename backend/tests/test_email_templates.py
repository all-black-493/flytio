"""Unit tests for the booking-confirmation email manifest
(utils/email_templates.py) - built from plain in-memory model instances,
not a DB session, since booking_confirmation_email_html only ever reads
attributes off objects handed to it."""

import uuid
from datetime import datetime

from backend.models.bookings import (
    Booking,
    BookingPassenger,
    BookingSlice,
    BookingStatus,
    CabinClass,
    PassengerType,
)
from backend.models.flights import Flight
from backend.utils.email_templates import booking_confirmation_email_html


def _booking(**overrides) -> Booking:
    booking = Booking(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        duffel_order_id="ord_test123",
        booking_reference="ABC123",
        status=BookingStatus.CONFIRMED,
        total_amount="107.00",
        total_currency="USD",
        base_amount="85.00",
        base_currency="USD",
        tax_amount="22.00",
        tax_currency="USD",
        owner_name="Duffel Airways",
        refund_allowed=False,
        change_allowed=True,
        change_penalty_amount="50.00",
        change_penalty_currency="USD",
    )
    for key, value in overrides.items():
        setattr(booking, key, value)

    slice_ = BookingSlice(
        id=uuid.uuid4(),
        booking_id=booking.id,
        duffel_slice_id="sli_test123",
        origin_iata_code="JFK",
        destination_iata_code="LHR",
    )
    slice_.flights = [
        Flight(
            id=uuid.uuid4(),
            slice_id=slice_.id,
            duffel_segment_id="seg_test123",
            origin_iata_code="JFK",
            destination_iata_code="LHR",
            departing_at=datetime(2026, 6, 1, 22, 0),
            arriving_at=datetime(2026, 6, 2, 10, 0),
            marketing_carrier_name="Duffel Airways",
            marketing_carrier_flight_number="123",
            operating_carrier_name="Iberia",
        )
    ]
    booking.slices = [slice_]

    booking.passengers = [
        BookingPassenger(
            id=uuid.uuid4(),
            booking_id=booking.id,
            duffel_passenger_id="pas_test123",
            passenger_type=PassengerType.ADULT,
            given_name="Tony",
            family_name="Stark",
            cabin_class=CabinClass.ECONOMY,
            checked_bags=1,
            carry_on_bags=1,
            seat_designator="14C",
        )
    ]
    return booking


def test_confirmation_email_includes_full_itinerary_and_receipt():
    html = booking_confirmation_email_html(_booking())

    assert "ABC123" in html
    assert "JFK" in html and "LHR" in html
    assert "Duffel Airways 123" in html
    assert "Operated by Iberia" in html
    assert "Tony Stark" in html
    assert "14C" in html
    assert "1 checked" in html and "1 carry-on" in html
    assert "Fare" in html and "USD 85.00" in html
    assert "Fees" in html and "USD 22.00" in html
    assert "USD 107.00" in html
    assert "Changes are allowed" in html and "50.00" in html
    assert "non-refundable" in html


def test_confirmation_email_includes_city_and_airport_names_when_known():
    """IATA codes alone don't mean anything to most bookers - when Duffel
    reported city/airport names for a location, the email should show them
    alongside the code, not just the bare code."""
    booking = _booking()
    booking.slices[0].origin_city_name = "New York"
    booking.slices[0].destination_city_name = "London"
    booking.slices[0].flights[0].origin_name = "John F. Kennedy International Airport"
    booking.slices[0].flights[0].destination_name = "Heathrow Airport"

    html = booking_confirmation_email_html(booking)

    assert "New York (JFK)" in html
    assert "London (LHR)" in html
    assert "John F. Kennedy International Airport (JFK)" in html
    assert "Heathrow Airport (LHR)" in html


def test_confirmation_email_falls_back_to_bare_codes_without_names():
    """No city/airport name reported for a location (older bookings, or
    Duffel simply not returning one) must still render cleanly with just
    the bare code - not a blank or a crash."""
    html = booking_confirmation_email_html(_booking())

    assert "(JFK)" not in html
    assert "(LHR)" not in html
    assert "JFK" in html and "LHR" in html


def test_confirmation_email_falls_back_to_total_only_without_fare_breakdown():
    """A booking made before base_amount/tax_amount started being
    persisted (or a real order where Duffel didn't report them) must not
    render a broken/empty breakdown."""
    booking = _booking(
        base_amount=None,
        tax_amount=None,
        refund_allowed=None,
        change_allowed=None,
    )

    html = booking_confirmation_email_html(booking)

    assert "Total paid" in html
    assert "USD 107.00" in html
    assert "Changes are" not in html
    assert "Refunds are" not in html
    assert "non-refundable" not in html
