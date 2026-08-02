"""Builds the downloadable e-itinerary/receipt PDF for a confirmed booking
- generated on demand by GET /booking/flight-orders/by-id/{id}/itinerary.pdf
(routers/flights.py) rather than attached to the confirmation email, so it
always reflects the booking's current state. Not a boarding pass - real
IATA boarding passes are only issued by the airline at check-in, which
this app has no access to - so this carries one QR code (a verification
link) rather than an IATA BCBP barcode.
"""

import io

import qrcode
from fpdf import FPDF

from backend.config import settings
from backend.models.bookings import Booking
from backend.utils.email_templates import format_flight_time

_INK = (11, 21, 38)
_MUTED = (85, 103, 124)


def _flight_row(flight) -> list[str]:
    carrier = flight.marketing_carrier_name or flight.marketing_carrier_iata_code or ""
    flight_number = flight.marketing_carrier_flight_number or ""
    return [
        f"{flight.origin_iata_code} -> {flight.destination_iata_code}",
        f"{format_flight_time(flight.departing_at)} - {format_flight_time(flight.arriving_at)}",
        f"{carrier} {flight_number}".strip(),
    ]


def _passenger_row(passenger) -> list[str]:
    name = f"{passenger.given_name} {passenger.family_name}"
    seat = passenger.seat_designator or "Assigned at check-in"
    ticket_numbers = (
        ", ".join(t.ticket_number for t in passenger.tickets)
        if passenger.tickets
        else "Pending"
    )
    return [name, seat, ticket_numbers]


def _booking_qr_image(booking: Booking) -> io.BytesIO:
    verification_url = (
        f"{settings.FRONTEND_URL}/account/bookings/{booking.id}"
        f"?ref={booking.booking_reference}"
    )
    buffer = io.BytesIO()
    qrcode.make(verification_url, border=2).save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def build_itinerary_pdf(booking: Booking) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*_INK)
    pdf.cell(0, 10, "flyt", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*_MUTED)
    pdf.cell(0, 7, "E-itinerary and receipt", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*_INK)
    pdf.cell(
        0,
        8,
        f"Booking reference: {booking.booking_reference}",
        new_x="LMARGIN",
        new_y="NEXT",
    )

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*_MUTED)
    pdf.cell(
        0,
        7,
        f"Airline: {booking.owner_name or '-'}   |   Total paid: "
        f"{booking.total_currency} {booking.total_amount}",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(6)

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*_INK)
    pdf.cell(0, 8, "Flights", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    flight_rows = [["Route", "Departs - Arrives", "Flight"]]
    for slice_ in booking.slices:
        flight_rows.extend(_flight_row(f) for f in slice_.flights)
    with pdf.table(flight_rows, text_align="left"):
        pass
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Passengers & tickets", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    passenger_rows = [["Passenger", "Seat", "Ticket number"]]
    passenger_rows.extend(_passenger_row(p) for p in booking.passengers)
    with pdf.table(passenger_rows, text_align="left"):
        pass
    pdf.ln(8)

    qr_image = _booking_qr_image(booking)
    qr_size = 32
    qr_x = pdf.w - pdf.r_margin - qr_size
    qr_y = pdf.h - pdf.b_margin - qr_size - 8
    pdf.image(qr_image, x=qr_x, y=qr_y, w=qr_size, h=qr_size)
    pdf.set_xy(pdf.l_margin, qr_y + 4)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_MUTED)
    pdf.multi_cell(
        pdf.w - pdf.l_margin - pdf.r_margin - qr_size - 6,
        5,
        "Scan the QR code to view this booking online. This document is "
        "an e-itinerary and receipt, not a boarding pass - check in with "
        "the airline to receive your boarding pass.",
    )

    return bytes(pdf.output())
