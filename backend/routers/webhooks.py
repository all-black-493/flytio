from fastapi import APIRouter, Depends, Request, Response, status
from sqlmodel import Session

from backend.config import settings
from backend.crud.bookings import record_airline_initiated_change
from backend.crud.db import get_session
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.duffel_webhooks import verify_duffel_signature
from backend.utils.kafka import kafka_producer
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

# The one event this endpoint acts on. Everything below the event-type
# check treats data.object.id as an ORDER id and stamps the booking as
# airline-changed, so widening this to any other type silently misroutes
# it: an order.created delivery would mark a brand new booking as having
# an airline change and email the customer "your flight may have changed"
# on the happy path of every single booking.
_AIRLINE_CHANGE_EVENT = "order.airline_initiated_change_detected"

# Types the Duffel subscription may deliver that this app knowingly does
# nothing with - listed so they're logged as recognised-but-unhandled
# rather than as a surprise, and so adding one here can never be mistaken
# for adding handling for it.
_UNHANDLED_EVENT_TYPES = {
    "order.created",
    "order.creation_failed",
    "order_cancellation.created",
    "order_cancellation.confirmed",
    "payment.created",
    "air.payment.failed",
    "air.payment.succeeded",
    "air.payment.cancelled",
    "air.payment.pending",
}


@router.post("/duffel", status_code=status.HTTP_200_OK, include_in_schema=False)
async def duffel_webhook(request: Request, session: Session = Depends(get_session)):
    """
    Receives Duffel's server-to-server webhook - today, the ONLY way this
    app finds out an airline changed something about an existing booking
    (schedule change, airline-initiated cancellation, etc); Duffel never
    otherwise pushes anything about an order after it's created.

    Always returns 200, even on a bad signature or an unhandled event type
    - Duffel's own reference implementation does the same (see
    https://duffel.com/docs/guides/receiving-webhooks): a non-2xx response
    makes Duffel retry, which isn't useful once a delivery has already
    been rejected as unverifiable, and this endpoint's URL isn't secret
    the way its signature is.
    """
    raw_body = await request.body()
    signature_header = request.headers.get("X-Duffel-Signature", "")

    if not verify_duffel_signature(
        settings.DUFFEL_WEBHOOK_SECRET, raw_body, signature_header
    ):
        logger.warning("Rejected a Duffel webhook with an invalid signature")
        return Response(status_code=status.HTTP_200_OK)

    try:
        event = await request.json()
    except ValueError:
        logger.warning("Duffel webhook body was not valid JSON")
        return Response(status_code=status.HTTP_200_OK)

    event_type = event.get("type")
    if event_type != _AIRLINE_CHANGE_EVENT:
        # Deliberately not a pass-through: everything below assumes an
        # airline-initiated change, so anything else must stop here.
        if event_type in _UNHANDLED_EVENT_TYPES:
            logger.info("Duffel webhook %s recognised but not acted on", event_type)
        else:
            logger.info("Ignoring unknown Duffel webhook event type: %s", event_type)
        return Response(status_code=status.HTTP_200_OK)

    # Duffel's v2 AIC payload nests the changed order under data.object,
    # with `id` being the order id (see Duffel's migrating-api-version-
    # from-v1-to-v2 guide) - the payload no longer carries what changed,
    # only that something did.
    order_id = ((event.get("data") or {}).get("object") or {}).get("id")
    if not order_id:
        logger.warning("Duffel webhook event missing an order id: %s", event)
        return Response(status_code=status.HTTP_200_OK)

    # Idempotent by construction - re-processing the same event (Duffel
    # retries on anything but a fast 2xx) just re-sets the same timestamp,
    # no duplicate side effect beyond a possible duplicate email via the
    # published event below.
    booking = record_airline_initiated_change(session, order_id)
    if booking is None:
        logger.warning("Duffel webhook event for an unknown order: %s", order_id)
        return Response(status_code=status.HTTP_200_OK)

    # record_airline_initiated_change commits before this runs, so the
    # booking row is already visible to the consumer (backend/workers/
    # kafka_consumer.py) by the time it acts on this event.
    if booking.user_id:
        kafka_producer.publish_event(
            KafkaTopics.BOOKING_EVENTS,
            KafkaEventTypes.AIRLINE_CHANGE_DETECTED,
            {"booking_id": booking.id, "user_id": booking.user_id},
        )

    return Response(status_code=status.HTTP_200_OK)
