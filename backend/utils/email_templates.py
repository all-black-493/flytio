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


def booking_confirmation_email_html(booking: Booking) -> str:
    """Short enterprise-style confirmation: route/date/total summary plus
    links to the full booking (account page) and the downloadable PDF
    itinerary (backend/utils/itinerary_pdf.py) - the full flight/passenger/
    ticket-number manifest lives in those two places now, not inline in
    the email body."""
    booking_url = f"{settings.FRONTEND_URL}/account/bookings/{booking.id}"
    pdf_url = (
        f"{settings.BACKEND_PUBLIC_URL}"
        f"/booking/flight-orders/by-id/{booking.id}/itinerary.pdf"
    )
    passenger_count = len(booking.passengers)

    inner = f"""
<h2 style="margin:0 0 4px;font-size:20px;">You're booked!</h2>
<p style="margin:0 0 20px;color:#55677c;">Booking reference <strong style="color:#0b1526;">{_esc(booking.booking_reference)}</strong></p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;border:1px solid #d8e0e8;margin-bottom:24px;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0;font-size:16px;font-weight:bold;">{_route_summary(booking)}</p>
      <p style="margin:4px 0 0;color:#55677c;">{_departure_date(booking)} · {passenger_count} passenger{"s" if passenger_count != 1 else ""} · {_esc(booking.owner_name) or "—"}</p>
      <p style="margin:12px 0 0;">Total paid: <strong>{_esc(booking.total_currency)} {_esc(booking.total_amount)}</strong></p>
    </td>
  </tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:#ff4f00;">
      <a href="{booking_url}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;text-decoration:none;">View booking</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0;">
  <a href="{pdf_url}" style="color:#ff4f00;">Download itinerary (PDF)</a> - includes your full flight and passenger details plus a QR code for quick lookup.
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
