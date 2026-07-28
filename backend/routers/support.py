"""Customer support contact form - a simple email relay, not a ticketing
system: a message goes to support@ (reply-to the customer's own address,
so a reply from a mail client reaches them directly) and the customer
gets an auto-reply confirmation. Nothing is persisted to the DB -
deliberately minimal scope; a durable record/admin view is a possible
future addition, not built here.
"""

from fastapi import APIRouter, BackgroundTasks

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
    return {"message": "Thanks - we'll get back to you by email shortly."}
