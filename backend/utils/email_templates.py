"""HTML builders for transactional emails - the shared branded shell
(`email_shell`, used by every email including utils/email.py's plain-text
`send_email_async`) plus the booking-confirmation-specific content below.
Plain string templates, no templating engine - kept simple and in one
place so the markup doesn't leak into crud/router code.
"""

import html

from backend.config import settings
from backend.models.bookings import Booking


def _esc(value) -> str:
    """Escapes a value for safe interpolation into the HTML templates
    below. Several of these fields (passenger given/family name in
    particular) are free text the customer entered at checkout, so this
    isn't just hygiene - without it a passenger name like
    `<img src=x onerror=...>` renders live in the recipient's email
    client."""
    return html.escape(str(value)) if value is not None else ""


def paragraphs_html(text: str) -> str:
    """Converts plain text with blank-line-separated paragraphs into
    escaped `<p>` tags - for callers (send_email_async) building a message
    out of a plain string rather than markup."""
    return "".join(f"<p>{_esc(p)}</p>" for p in text.split("\n\n") if p.strip())


def email_shell(preheader: str, inner_html: str) -> str:
    """Wraps `inner_html` in flyt's branded email shell: a logo header and
    a plain footer, shared by every transactional email so they're all
    visually consistent. Table-based layout (not flexbox/grid) since
    that's what actually renders reliably across email clients. The logo
    is a real PNG (frontend/public/logo-email.png, rasterized from
    logo-mark.svg) rather than the inline SVG the app uses elsewhere -
    most email clients, Outlook in particular, don't render inline SVG.
    `preheader` is the short hidden preview text shown next to the subject
    line in inbox lists (Gmail, Outlook, etc.) before the email is opened.
    """
    logo_url = f"{settings.FRONTEND_URL}/logo-email.png"
    return f"""
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{_esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #d8e0e8;">
        <tr>
          <td style="background:#0b1526;padding:20px 32px;">
            <img src="{logo_url}" alt="flyt" width="32" height="32" style="vertical-align:middle;border-radius:8px;" />
            <span style="font-size:20px;font-weight:bold;color:#ffffff;vertical-align:middle;margin-left:10px;">flyt</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#0b1526;font-size:14px;line-height:1.6;">
            {inner_html}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #d8e0e8;color:#55677c;font-size:12px;">
            <p style="margin:0;">Safe travels, from the flyt team.</p>
            <p style="margin:8px 0 0;">This is an automated message - please don't reply directly to this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
"""


def format_flight_time(dt) -> str:
    """Shared by the email summary below and utils/itinerary_pdf.py, so
    the two documents show dates/times in the same format."""
    return dt.strftime("%a, %d %b %Y %H:%M")


def _route_summary(booking: Booking) -> str:
    """A one-line route, e.g. "NBO → DXB" one-way or "NBO → DXB → NBO"
    round-trip, built from each slice's origin plus the final slice's
    destination - avoids repeating the same airport as both one slice's
    destination and the next slice's origin."""
    codes = [booking.slices[0].origin_iata_code] + [
        s.destination_iata_code for s in booking.slices
    ]
    return " → ".join(_esc(c) for c in codes)


def _departure_date(booking: Booking) -> str:
    first_flight = booking.slices[0].flights[0]
    return _esc(first_flight.departing_at.strftime("%d %b %Y"))


def _segment_html(flight) -> str:
    """One flight (segment) row: carrier/flight number, route with actual
    departure/arrival times (not just the date), and an "operated by" note
    when it differs from the marketing carrier - Duffel's own guidance
    (displaying-offer-and-order-conditions) is that operating-carrier
    mismatches are common on codeshares and worth surfacing."""
    carrier = flight.marketing_carrier_name or flight.marketing_carrier_iata_code or ""
    flight_number = flight.marketing_carrier_flight_number or ""
    operated_by = ""
    if (
        flight.operating_carrier_name
        and flight.operating_carrier_name != flight.marketing_carrier_name
    ):
        operated_by = f'<p style="margin:4px 0 0;color:#55677c;font-size:12px;">Operated by {_esc(flight.operating_carrier_name)}</p>'
    return f"""
<tr>
  <td style="padding:10px 0;border-top:1px solid #eef2f6;">
    <p style="margin:0;font-weight:bold;">{_esc(carrier)} {_esc(flight_number)}</p>
    <p style="margin:4px 0 0;color:#55677c;">
      {_esc(flight.origin_iata_code)} {format_flight_time(flight.departing_at)}
      &nbsp;→&nbsp;
      {_esc(flight.destination_iata_code)} {format_flight_time(flight.arriving_at)}
    </p>
    {operated_by}
  </td>
</tr>
"""


def _slice_html(slice_) -> str:
    rows = "".join(_segment_html(f) for f in slice_.flights)
    return f"""
<div style="margin-bottom:16px;">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.05em;color:#55677c;text-transform:uppercase;">
    {_esc(slice_.origin_iata_code)} → {_esc(slice_.destination_iata_code)}
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    {rows}
  </table>
</div>
"""


def _passenger_html(passenger) -> str:
    name = f"{passenger.given_name} {passenger.family_name}".strip()
    cabin = (
        passenger.cabin_class.value.replace("_", " ").title()
        if passenger.cabin_class
        else "—"
    )
    bags = []
    if passenger.checked_bags:
        bags.append(f"{passenger.checked_bags} checked")
    if passenger.carry_on_bags:
        bags.append(f"{passenger.carry_on_bags} carry-on")
    baggage = ", ".join(bags) if bags else "—"
    seat = passenger.seat_designator or "Assigned at check-in"
    return f"""
<tr>
  <td style="padding:8px 0;border-top:1px solid #eef2f6;">{_esc(name)}</td>
  <td style="padding:8px 0;border-top:1px solid #eef2f6;color:#55677c;">{_esc(cabin)}</td>
  <td style="padding:8px 0;border-top:1px solid #eef2f6;color:#55677c;">{_esc(baggage)}</td>
  <td style="padding:8px 0;border-top:1px solid #eef2f6;color:#55677c;">{_esc(seat)}</td>
</tr>
"""


def _receipt_html(booking: Booking) -> str:
    """Fare breakdown - base_amount/tax_amount are only populated on
    bookings made since that split started being persisted (see
    crud/bookings.py's _fare_breakdown); older bookings fall back to a
    single total line rather than showing a broken/empty breakdown."""
    if booking.base_amount is not None and booking.tax_amount is not None:
        return f"""
<tr><td style="padding:2px 0;">Fare</td><td style="padding:2px 0;text-align:right;">{_esc(booking.base_currency)} {_esc(booking.base_amount)}</td></tr>
<tr><td style="padding:2px 0;">Fees &amp; taxes</td><td style="padding:2px 0;text-align:right;">{_esc(booking.tax_currency)} {_esc(booking.tax_amount)}</td></tr>
<tr><td style="padding:8px 0 0;font-weight:bold;border-top:1px solid #d8e0e8;">Total</td><td style="padding:8px 0 0;text-align:right;font-weight:bold;border-top:1px solid #d8e0e8;">{_esc(booking.total_currency)} {_esc(booking.total_amount)}</td></tr>
"""
    return f'<tr><td style="padding:2px 0;font-weight:bold;">Total paid</td><td style="padding:2px 0;text-align:right;font-weight:bold;">{_esc(booking.total_currency)} {_esc(booking.total_amount)}</td></tr>'


def _conditions_html(booking: Booking) -> str:
    """Change/refund terms, mirroring what displaying-offer-and-order-
    conditions recommends showing customers - omitted entirely (not shown
    as a blank/"unknown" line) when Duffel didn't report a condition for
    this order, since None means "not reported", not "not allowed"."""
    lines = []
    if booking.change_allowed is not None:
        if booking.change_allowed:
            penalty = (
                f" (penalty: {_esc(booking.change_penalty_currency)} {_esc(booking.change_penalty_amount)})"
                if booking.change_penalty_amount
                else " (no penalty)"
            )
            lines.append(f"Changes are allowed{penalty}.")
        else:
            lines.append("Changes are not allowed on this fare.")
    if booking.refund_allowed is not None:
        if booking.refund_allowed:
            penalty = (
                f" (penalty: {_esc(booking.refund_penalty_currency)} {_esc(booking.refund_penalty_amount)})"
                if booking.refund_penalty_amount
                else " (no penalty)"
            )
            lines.append(f"Refunds are allowed{penalty}.")
        else:
            lines.append("This fare is non-refundable.")
    if not lines:
        return ""
    return f'<p style="margin:16px 0 0;color:#55677c;font-size:12px;">{" ".join(lines)}</p>'


def booking_confirmation_email_html(booking: Booking) -> str:
    """A full manifest inline in the email body - flight-by-flight
    itinerary, passengers with cabin/baggage/seat, and the fare breakdown
    - per Duffel's handling-flight-booking-confirmation-emails guide
    ("include the flight itinerary, payment details, and the booking
    reference"), plus links to the account page and the downloadable PDF
    for anyone who wants the full record offline."""
    booking_url = f"{settings.FRONTEND_URL}/account/bookings/{booking.id}"
    pdf_url = (
        f"{settings.BACKEND_PUBLIC_URL}"
        f"/booking/flight-orders/by-id/{booking.id}/itinerary.pdf"
    )
    passenger_count = len(booking.passengers)
    slices_html = "".join(_slice_html(s) for s in booking.slices)
    passenger_rows = "".join(_passenger_html(p) for p in booking.passengers)

    inner = f"""
<h2 style="margin:0 0 4px;font-size:20px;">You're booked!</h2>
<p style="margin:0 0 20px;color:#55677c;">Booking reference <strong style="color:#0b1526;">{_esc(booking.booking_reference)}</strong></p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;border:1px solid #d8e0e8;margin-bottom:24px;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0;font-size:16px;font-weight:bold;">{_route_summary(booking)}</p>
      <p style="margin:4px 0 0;color:#55677c;">{_departure_date(booking)} · {passenger_count} passenger{"s" if passenger_count != 1 else ""} · {_esc(booking.owner_name) or "—"}</p>
    </td>
  </tr>
</table>

<h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;">Itinerary</h3>
{slices_html}

<h3 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;">Passengers</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
  <tr style="color:#55677c;font-size:11px;text-transform:uppercase;">
    <td style="padding:0 0 4px;">Name</td>
    <td style="padding:0 0 4px;">Class</td>
    <td style="padding:0 0 4px;">Baggage</td>
    <td style="padding:0 0 4px;">Seat</td>
  </tr>
  {passenger_rows}
</table>

<h3 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;">Your trip receipt</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
  {_receipt_html(booking)}
</table>
{_conditions_html(booking)}

<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
  <tr>
    <td style="background:#ff4f00;">
      <a href="{booking_url}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;text-decoration:none;">View booking</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0;">
  <a href="{pdf_url}" style="color:#ff4f00;">Download itinerary (PDF)</a> - includes a QR code for quick lookup.
</p>
"""
    return email_shell(
        preheader=f"Your booking {booking.booking_reference} is confirmed.",
        inner_html=inner,
    )


def airline_change_email_html(booking: Booking) -> str:
    """Sent when the Duffel webhook receiver (routers/webhooks.py) detects
    an order.airline_initiated_change_detected event - the airline itself
    changed something about this booking (schedule, cancellation, etc).
    Duffel's v2 webhook payload doesn't include what changed, only that it
    did, so this points the customer at their booking rather than
    describing the change itself."""
    booking_url = f"{settings.FRONTEND_URL}/account/bookings/{booking.id}"

    inner = f"""
<h2 style="margin:0 0 4px;font-size:20px;">Your flight details may have changed</h2>
<p style="margin:0 0 20px;color:#55677c;">Booking reference <strong style="color:#0b1526;">{_esc(booking.booking_reference)}</strong></p>

<p style="margin:0 0 20px;">
{_esc(booking.owner_name) or "The airline"} has made a change to your itinerary -
this could be a schedule change, a flight number change, or a
cancellation. Please review your booking for the latest details before
you travel.
</p>

<table role="presentation" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:#ff4f00;">
      <a href="{booking_url}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;text-decoration:none;">Review my booking</a>
    </td>
  </tr>
</table>
"""
    return email_shell(
        preheader=f"{booking.owner_name or 'The airline'} changed your itinerary {booking.booking_reference}.",
        inner_html=inner,
    )
