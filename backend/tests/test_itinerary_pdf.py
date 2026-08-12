"""Tests for the printable e-ticket PDF (utils/itinerary_pdf.py).

The layout can't be asserted meaningfully from bytes, so these cover the
things that would silently produce a broken or dangerous document: a
ticket per traveller per leg, the shared QR, and the fact that it never
claims to be a boarding pass.
"""

from datetime import datetime
from types import SimpleNamespace

from pypdf import PdfReader
import io

from backend.utils.itinerary_pdf import (
    booking_qr_png,
    booking_verification_url,
    build_itinerary_pdf,
)


def _flight():
    return SimpleNamespace(
        origin_iata_code="NBO",
        destination_iata_code="DXB",
        departing_at=datetime(2026, 9, 15, 17, 10),
        arriving_at=datetime(2026, 9, 15, 22, 15),
        marketing_carrier_name="Kenya Airways",
        marketing_carrier_iata_code="KQ",
        marketing_carrier_flight_number="310",
    )


def _slice():
    return SimpleNamespace(
        origin_iata_code="NBO",
        destination_iata_code="DXB",
        origin_city_name="Nairobi",
        origin_name=None,
        destination_city_name="Dubai",
        destination_name=None,
        flights=[_flight()],
    )


def _booking(passengers, slices=None):
    return SimpleNamespace(
        id="b1",
        booking_reference="JJFWBW",
        owner_name="Kenya Airways",
        total_amount="391.99",
        total_currency="USD",
        slices=slices or [_slice()],
        passengers=passengers,
    )


def _passenger(given: str, seat: str | None = None, ticket: str | None = None):
    return SimpleNamespace(
        given_name=given,
        family_name="Traveller",
        seat_designator=seat,
        tickets=[SimpleNamespace(ticket_number=ticket)] if ticket else [],
    )


def _text(pdf_bytes: bytes) -> str:
    return "\n".join(
        p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages
    )


def test_one_ticket_per_traveller_per_leg():
    pdf = build_itinerary_pdf(_booking([_passenger("Jeremy"), _passenger("Alex")]))
    text = _text(pdf)
    assert "Jeremy" in text and "Alex" in text
    # Two travellers on one leg means the route figure appears twice.
    assert text.count("NBO") >= 2


def test_never_presents_itself_as_a_boarding_pass():
    """The whole reason this isn't styled as one: a document implying it
    can be boarded with invites a traveller to skip check-in."""
    text = _text(build_itinerary_pdf(_booking([_passenger("Jeremy", seat="28C")])))
    assert "boarding pass" in text.lower()
    assert "not a boarding pass" in text.lower()
    assert "E-TICKET" in text


def test_missing_seat_says_where_it_comes_from():
    """A blank seat could read as "none needed"; it has to name check-in."""
    text = _text(build_itinerary_pdf(_booking([_passenger("Jeremy", seat=None)])))
    assert "At check-in" in text


def test_qr_is_the_live_booking_not_a_static_payload():
    """Scanning resolves to the booking, so a printed ticket can't
    contradict a schedule change made after it was printed."""
    booking = _booking([_passenger("Jeremy")])
    url = booking_verification_url(booking)
    assert booking.booking_reference in url
    assert str(booking.id) in url
    assert booking_qr_png(booking).getvalue().startswith(b"\x89PNG")
