"""Customer support contact form - a simple email relay, not a ticketing
system: a message goes to support@ (reply-to the customer's own address,
so a reply from a mail client reaches them directly) and the customer
gets an auto-reply confirmation. Nothing is persisted to the DB -
deliberately minimal scope; a durable record/admin view is a possible
future addition, not built here.
"""

from fastapi import APIRouter, BackgroundTasks
from sqlmodel import Session

from backend.crud.db import engine
from backend.crud.notifications import notify_staff
from backend.models.notifications import NotificationType
from backend.schemas.support import ContactRequest
from backend.utils.email import (
    SENDER_SUPPORT,
    SENDER_TRANSACTIONAL,
    send_html_email_async,
)
from backend.utils.email_templates import (
    support_autoreply_email_html,
    support_request_email_html,
)
from backend.utils.guard import guard_deco

router = APIRouter(prefix="/support")


async def _notify_staff_of_support_request(
    subject: str, booking_reference: str | None
) -> None:
    """A background task can't reuse the request's Depends(get_session) -
    FastAPI closes it before background tasks run (0.106.0+, confirmed
    against FastAPI's own docs), so this opens its own short-lived
    session instead of taking one as a parameter."""
    with Session(engine) as session:
        await notify_staff(
            session,
            type=NotificationType.SUPPORT_REQUEST,
            title=f"New support request: {subject}",
            body=f"Booking reference: {booking_reference}"
            if booking_reference
            else None,
            link_url="/admin",
        )


# Unauthenticated - a customer who can't log in (payment issue, locked
# out) is exactly who needs this most. IP-keyed rate limit against spam,
# same order of magnitude as other unauthenticated endpoints (see
# routers/payments.py's CHECKOUT_IP_LIMIT) rather than tighter - a lower
# limit buys little extra spam protection but bites legitimate retries.
CONTACT_IP_LIMIT = 10
CONTACT_WINDOW_SECONDS = 60 * 10


@router.post("/contact")
@guard_deco.rate_limit(requests=CONTACT_IP_LIMIT, window=CONTACT_WINDOW_SECONDS)
async def contact_support(request: ContactRequest, background_tasks: BackgroundTasks):
    """Relays a support message and confirms receipt to the customer."""
    background_tasks.add_task(
        send_html_email_async,
        f"Support: {request.subject}",
        [SENDER_SUPPORT],
        support_request_email_html(
            request.name,
            request.email,
            request.subject,
            request.message,
            request.booking_reference,
        ),
        from_address=SENDER_TRANSACTIONAL,
        reply_to=request.email,
    )
    background_tasks.add_task(
        send_html_email_async,
        "We've received your message",
        [request.email],
        support_autoreply_email_html(request.name, request.subject),
        from_address=SENDER_SUPPORT,
    )
    background_tasks.add_task(
        _notify_staff_of_support_request, request.subject, request.booking_reference
    )
    return {"message": "Thanks - we'll get back to you by email shortly."}
