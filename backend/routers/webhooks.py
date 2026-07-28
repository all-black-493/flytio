from fastapi import APIRouter, Depends, Request, Response, status
from sqlmodel import Session

from backend.config import settings
from backend.crud.bookings import record_airline_initiated_change
from backend.crud.db import get_session
from backend.utils.duffel_webhooks import verify_duffel_signature
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import airline_change_email_html
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

router = APIRouter(prefix="/webhooks")

# See backend/scripts/register_duffel_webhook.py - the only event type this
# endpoint is actually registered for today. Anything else Duffel might
# someday deliver to this same URL (a broadened registration, a dashboard
# change) is safely ignored below rather than assumed handled.
_HANDLED_EVENT_TYPES = {"order.airline_initiated_change_detected"}


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
    if event_type not in _HANDLED_EVENT_TYPES:
        logger.info("Ignoring Duffel webhook event type: %s", event_type)
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
    # no duplicate side effect beyond a possible duplicate email below.
    booking = record_airline_initiated_change(session, order_id)
    if booking is None:
        logger.warning("Duffel webhook event for an unknown order: %s", order_id)
        return Response(status_code=status.HTTP_200_OK)

    try:
        user = booking.user
        if user:
            await send_html_email_async(
                f"Your flight {booking.booking_reference} may have changed",
                [user.email],
                airline_change_email_html(booking),
                from_address=SENDER_BOOKINGS,
            )
    except Exception:
        # The change is already recorded on the booking - a failed
        # notification email must not be mistaken for a failed webhook.
        logger.exception(
            "Failed to send airline-change notification for booking %s", booking.id
        )

    return Response(status_code=status.HTTP_200_OK)
