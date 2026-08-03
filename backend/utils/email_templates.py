"""HTML renderers for transactional emails - thin Python wrappers around
the real templates in backend/templates/emails/*.html, rendered through
Jinja2 with autoescaping on (so passenger-entered free text like a given
name can never inject markup into the recipient's inbox). Keeps the
public function signatures every caller (crud/payments.py, routers/
webhooks.py, routers/support.py, utils/email.py) already depends on -
only the markup moved out of Python, not the interface.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from backend.config import settings
from backend.utils.constants import API_V1_PREFIX
from backend.models.bookings import Booking

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"

_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def paragraphs_html(text: str) -> str:
    """Converts plain text with blank-line-separated paragraphs into
    escaped `<p>` tags - for callers (send_email_async) building a message
    out of a plain string rather than markup. Rendered through the same
    autoescaping Environment as everything else here, so this stays the
    one place that decides how a paragraph gets escaped."""
    template = _env.from_string("{% for p in paragraphs %}<p>{{ p }}</p>{% endfor %}")
    return template.render(paragraphs=[p for p in text.split("\n\n") if p.strip()])


def email_shell(preheader: str, inner_html: str) -> str:
    """Wraps already-built `inner_html` in flyt's branded shell
    (templates/emails/_shell.html) - used directly by callers that build
    their own markup (utils/email.py's send_email_async) rather than
    extending the shell as a template. `inner_html` is trusted pre-escaped
    HTML (e.g. from paragraphs_html above), so it's marked `safe` inside
    the template rather than re-escaped."""
    return _env.get_template("_shell.html").render(
        preheader=preheader,
        content=inner_html,
        logo_url=f"{settings.FRONTEND_URL}/logo-email.png",
    )


def format_flight_time(dt) -> str:
    """Shared by utils/itinerary_pdf.py, so the PDF and the confirmation
    email show dates/times in the same format."""
    return dt.strftime("%a, %d %b %Y %H:%M")


def _route_summary(booking: Booking) -> str:
    """A one-line route, e.g. "Nairobi (NBO) → Dubai (DXB)" one-way or with
    the return leg appended for round-trips, built from each slice's
    origin plus the final slice's destination - avoids repeating the same
    airport as both one slice's destination and the next slice's origin.
    Prefers the city name (more recognizable at a glance) over the
    airport name. Kept in Python (not the template) since it's real
    control flow over the booking's slices, not markup."""

    def label(code: str, name: str | None) -> str:
        return f"{name} ({code})" if name else code

    slices = booking.slices
    stops = [
        (
            slices[0].origin_iata_code,
            slices[0].origin_city_name or slices[0].origin_name,
        )
    ] + [
        (s.destination_iata_code, s.destination_city_name or s.destination_name)
        for s in slices
    ]
    return " → ".join(label(code, name) for code, name in stops)


def _render(template_name: str, **context) -> str:
    return _env.get_template(template_name).render(
        logo_url=f"{settings.FRONTEND_URL}/logo-email.png", **context
    )


def booking_confirmation_email_html(booking: Booking) -> str:
    """A full manifest inline in the email body - flight-by-flight
    itinerary, passengers with cabin/baggage/seat, and the fare breakdown
    - per Duffel's handling-flight-booking-confirmation-emails guide
    ("include the flight itinerary, payment details, and the booking
    reference"), plus links to the account page and the downloadable PDF
    for anyone who wants the full record offline."""
    return _render(
        "booking_confirmation.html",
        preheader=f"Your booking {booking.booking_reference} is confirmed.",
        booking=booking,
        route_summary=_route_summary(booking),
        departure_date=booking.slices[0].flights[0].departing_at.strftime("%d %b %Y"),
        booking_url=f"{settings.FRONTEND_URL}/account/bookings/{booking.id}",
        # Lands in a customer's inbox and stays there indefinitely, so it
        # has to name the API version explicitly - an email sent today is
        # still clicked long after /api/v2 exists.
        pdf_url=(
            f"{settings.BACKEND_PUBLIC_URL}{API_V1_PREFIX}"
            f"/booking/flight-orders/by-id/{booking.id}/itinerary.pdf"
        ),
    )


def airline_change_email_html(booking: Booking) -> str:
    """Sent when the Duffel webhook receiver (routers/webhooks.py) detects
    an order.airline_initiated_change_detected event - the airline itself
    changed something about this booking (schedule, cancellation, etc).
    Duffel's v2 webhook payload doesn't include what changed, only that it
    did, so this points the customer at their booking rather than
    describing the change itself."""
    return _render(
        "airline_change.html",
        preheader=f"{booking.owner_name or 'The airline'} changed your itinerary {booking.booking_reference}.",
        booking=booking,
        booking_url=f"{settings.FRONTEND_URL}/account/bookings/{booking.id}",
    )


def support_request_email_html(
    name: str,
    email: str,
    subject: str,
    message: str,
    booking_reference: str | None,
) -> str:
    """Internal notification to support@ for a new contact-form
    submission (routers/support.py) - sent with reply_to set to the
    customer's own address, so replying from a mail client reaches them
    directly rather than support@ replying to itself."""
    return _render(
        "support_request.html",
        preheader=f"New support request: {subject}",
        name=name,
        email=email,
        subject=subject,
        message=message,
        booking_reference=booking_reference,
    )


def support_autoreply_email_html(name: str, subject: str) -> str:
    """Confirmation sent back to the customer after a support request -
    reassures them it actually went through, since there's no ticketing
    system/status page to check otherwise."""
    return _render(
        "support_autoreply.html",
        preheader="We've received your message.",
        name=name,
        subject=subject,
    )
