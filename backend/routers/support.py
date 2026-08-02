"""Customer support contact form - a simple email relay, not a ticketing
system: a message goes to support@ (reply-to the customer's own address,
so a reply from a mail client reaches them directly) and the customer
gets an auto-reply confirmation. Nothing is persisted to the DB -
deliberately minimal scope; a durable record/admin view is a possible
future addition, not built here.
"""

from fastapi import APIRouter

from backend.schemas.support import ContactRequest
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.guard import guard_deco
from backend.utils.kafka import kafka_producer

router = APIRouter(prefix="/support", tags=["Support"])

# Unauthenticated - a customer who can't log in (payment issue, locked
# out) is exactly who needs this most. IP-keyed rate limit against spam,
# same order of magnitude as other unauthenticated endpoints (see
# routers/payments.py's CHECKOUT_IP_LIMIT) rather than tighter - a lower
# limit buys little extra spam protection but bites legitimate retries.
CONTACT_IP_LIMIT = 10
CONTACT_WINDOW_SECONDS = 60 * 10


@router.post("/contact")
@guard_deco.rate_limit(requests=CONTACT_IP_LIMIT, window=CONTACT_WINDOW_SECONDS)
async def contact_support(request: ContactRequest):
    """Relays a support message and confirms receipt to the customer.

    Nothing here reads from or depends on the DB row this request itself
    creates (there isn't one - the form is stateless), so it's safe to
    publish the event immediately: the staff email, the customer
    autoreply, and the staff in-app notification (see
    backend/workers/kafka_consumer.py) all happen out of the request path.
    """
    kafka_producer.publish_event(
        KafkaTopics.SUPPORT_EVENTS,
        KafkaEventTypes.SUPPORT_REQUEST_RECEIVED,
        {
            "name": request.name,
            "email": request.email,
            "subject": request.subject,
            "message": request.message,
            "booking_reference": request.booking_reference,
        },
    )
    return {"message": "Thanks - we'll get back to you by email shortly."}
