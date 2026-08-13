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


def booking_verification_url(booking: Booking) -> str:
    """What the QR resolves to: the live booking. Scanning it shows the
    booking's CURRENT state, so a printed ticket can't contradict a
    schedule change or a cancellation that happened after it was
    printed."""
    return (
        f"{settings.FRONTEND_URL}/account/bookings/{booking.id}"
        f"?ref={booking.booking_reference}"
    )


def booking_qr_png(booking: Booking) -> io.BytesIO:
    """The booking's QR as PNG bytes. Shared by the PDF below and by the
    GET .../qr.png route the on-screen ticket points at, so the code a
    traveller sees on screen is byte-identical to the printed one."""
    buffer = io.BytesIO()
    qrcode.make(booking_verification_url(booking), border=2).save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


# One ticket per traveller per leg, laid out like the on-screen
# TicketDocument so the printed and rendered artefacts are recognisably
# the same thing. Millimetres, matching FPDF's default unit.
_TICKET_H = 58
_STUB_W = 46
_PAGE_MARGIN = 14

_BOARD = (11, 21, 38)  # the dark stub, same #0B1526 as the app
_BOARD_INK = (246, 248, 250)
_SIGNAL = (255, 79, 0)
_HAIRLINE = (208, 216, 224)

# What a boarding pass prints as the gate. flyt never knows it - the
# airline assigns gates at check-in and Duffel exposes no such field -
# and saying so is why this document doesn't call itself a boarding pass.
_GATE_PLACEHOLDER = "At check-in"


def _field(pdf: FPDF, x: float, y: float, label: str, value: str, width: float) -> None:
    """One label-over-value cell of the data grid."""
    pdf.set_xy(x, y)
    pdf.set_font("Helvetica", "", 6)
    pdf.set_text_color(*_MUTED)
    pdf.cell(width, 3, label.upper())
    pdf.set_xy(x, y + 3.2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*_INK)
    # Truncated rather than wrapped: a name that overflows must not push
    # the row below into the next field's baseline.
    pdf.cell(width, 4, _fit(pdf, value, width))


def _fit(pdf: FPDF, text: str, width: float) -> str:
    """Trims to fit `width`, since a fixed-height ticket has no room to
    reflow."""
    if pdf.get_string_width(text) <= width:
        return text
    while text and pdf.get_string_width(text + "...") > width:
        text = text[:-1]
    return text + "..." if text else ""


def _route(pdf: FPDF, x: float, y: float, width: float, origin: str, dest: str) -> None:
    """ORIGIN ---- DEST with the dashed flight path between them - the
    figure every airline ticket leads with."""
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*_INK)
    pdf.set_xy(x, y)
    pdf.cell(28, 9, origin)
    pdf.set_xy(x + width - 28, y)
    pdf.cell(28, 9, dest, align="R")

    line_y = y + 5
    pdf.set_draw_color(*_SIGNAL)
    pdf.set_line_width(0.4)
    pdf.set_dash_pattern(dash=1.2, gap=1.2)
    pdf.line(x + 30, line_y, x + width - 30, line_y)
    pdf.set_dash_pattern()  # back to solid for every later stroke
    # Endpoint dots, the same signal-orange markers the screen uses.
    pdf.set_fill_color(*_SIGNAL)
    pdf.circle(x=x + 29, y=line_y - 0.7, radius=0.7, style="F")
    pdf.circle(x=x + width - 30.7, y=line_y - 0.7, radius=0.7, style="F")


def _ticket(pdf: FPDF, booking: Booking, slice_, passenger, qr, top: float) -> None:
    left = _PAGE_MARGIN
    width = pdf.w - 2 * _PAGE_MARGIN
    body_w = width - _STUB_W

    # Outline + stub fill.
    pdf.set_draw_color(*_HAIRLINE)
    pdf.set_line_width(0.2)
    pdf.rect(left, top, width, _TICKET_H)
    pdf.set_fill_color(*_BOARD)
    pdf.rect(left + body_w, top, _STUB_W, _TICKET_H, style="F")

    # The perforation - a real tear line, not decoration.
    pdf.set_draw_color(*_HAIRLINE)
    pdf.set_dash_pattern(dash=1.5, gap=1.5)
    pdf.line(left + body_w, top, left + body_w, top + _TICKET_H)
    pdf.set_dash_pattern()

    flights = list(slice_.flights)
    first = flights[0] if flights else None
    last = flights[-1] if flights else None

    # --- body ---------------------------------------------------------
    pdf.set_xy(left + 6, top + 5)
    pdf.set_font("Helvetica", "", 6)
    pdf.set_text_color(*_MUTED)
    pdf.cell(40, 3, "E-TICKET")
    pdf.set_xy(left + body_w - 66, top + 5)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*_INK)
    pdf.cell(60, 3, _fit(pdf, booking.owner_name or "", 60), align="R")

    _route(
        pdf,
        left + 6,
        top + 12,
        body_w - 12,
        slice_.origin_iata_code,
        slice_.destination_iata_code,
    )

    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*_MUTED)
    pdf.set_xy(left + 6, top + 23)
    pdf.cell(body_w - 12, 4, _city(slice_.origin_city_name, slice_.origin_name))
    pdf.set_xy(left + 6, top + 23)
    pdf.cell(
        body_w - 12,
        4,
        _city(slice_.destination_city_name, slice_.destination_name),
        align="R",
    )

    if first and last:
        pdf.set_xy(left + 6, top + 29)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*_INK)
        pdf.cell(body_w - 12, 4, format_flight_time(first.departing_at))
        pdf.set_xy(left + 6, top + 29)
        pdf.cell(body_w - 12, 4, format_flight_time(last.arriving_at), align="R")

    # Data grid, mirroring the on-screen field row.
    grid_y = top + 39
    pdf.set_draw_color(*_HAIRLINE)
    pdf.set_dash_pattern(dash=1, gap=1)
    pdf.line(left + 6, grid_y - 3, left + body_w - 6, grid_y - 3)
    pdf.set_dash_pattern()

    col = (body_w - 12) / 4
    flight_number = (
        f"{first.marketing_carrier_iata_code or ''}"
        f"{first.marketing_carrier_flight_number or ''}".strip()
        if first
        else "-"
    )
    _field(
        pdf,
        left + 6,
        grid_y,
        "Passenger",
        f"{passenger.given_name} {passenger.family_name}",
        col,
    )
    _field(pdf, left + 6 + col, grid_y, "Flight", flight_number or "-", col)
    _field(
        pdf,
        left + 6 + 2 * col,
        grid_y,
        "Seat",
        passenger.seat_designator or _GATE_PLACEHOLDER,
        col,
    )
    _field(pdf, left + 6 + 3 * col, grid_y, "Gate", _GATE_PLACEHOLDER, col)

    # --- stub ---------------------------------------------------------
    stub_x = left + body_w
    pdf.set_xy(stub_x + 5, top + 5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*_BOARD_INK)
    pdf.cell(_STUB_W - 10, 4, booking.booking_reference)

    pdf.set_xy(stub_x + 5, top + 10)
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(
        _STUB_W - 10,
        4,
        f"{slice_.origin_iata_code} - {slice_.destination_iata_code}",
    )

    qr_size = 26
    pdf.image(qr, x=stub_x + (_STUB_W - qr_size) / 2, y=top + 17, w=qr_size, h=qr_size)
    # Rewound because a single BytesIO is reused for every ticket on the
    # page - without this only the first would render.
    qr.seek(0)

    ticket_number = passenger.tickets[0].ticket_number if passenger.tickets else None
    if ticket_number:
        pdf.set_xy(stub_x + 5, top + 45)
        pdf.set_font("Helvetica", "", 6)
        pdf.set_text_color(*_BOARD_INK)
        pdf.cell(_STUB_W - 10, 3, _fit(pdf, ticket_number, _STUB_W - 10), align="C")


def _city(city: str | None, name: str | None) -> str:
    return (city or name or "").upper()


def build_itinerary_pdf(booking: Booking) -> bytes:
    """The booking as printable tickets - one per traveller per leg, laid
    out like components/tickets/TicketDocument.tsx so the printed sheet and
    the screen are recognisably the same artefact.

    Deliberately not a boarding pass: only the airline issues those, at
    check-in, and flyt is never given a gate, terminal or check-in
    sequence. The footer says so, and the gate field says "At check-in"
    rather than leaving a blank a traveller might read as "none needed".
    """
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    pdf.set_xy(_PAGE_MARGIN, 12)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*_INK)
    pdf.cell(40, 8, "flyt")
    pdf.set_xy(pdf.w - _PAGE_MARGIN - 60, 14)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*_MUTED)
    pdf.cell(60, 5, f"Booking {booking.booking_reference}", align="R")

    qr = booking_qr_png(booking)
    top = 26
    for slice_ in booking.slices:
        for passenger in booking.passengers:
            # A new page before a ticket would otherwise be clipped -
            # auto page break is off because each ticket is positioned
            # absolutely rather than flowing.
            if top + _TICKET_H > pdf.h - 24:
                pdf.add_page()
                top = 20
            _ticket(pdf, booking, slice_, passenger, qr, top)
            top += _TICKET_H + 6

    pdf.set_xy(_PAGE_MARGIN, pdf.h - 20)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*_MUTED)
    pdf.multi_cell(
        pdf.w - 2 * _PAGE_MARGIN,
        3.5,
        "Scan the QR code to view this booking online. This is your e-ticket "
        "and receipt, not a boarding pass - check in with the airline to get "
        "your boarding pass, seat and gate.",
    )

    return bytes(pdf.output())
