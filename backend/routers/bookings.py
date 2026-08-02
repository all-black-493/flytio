import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlmodel import Session

from backend.crud.bookings import (
    build_order_request_body,
    count_user_bookings,
    create_booking_from_order,
    get_booking,
    get_booking_by_duffel_order_id,
    get_user_bookings,
    mark_booking_cancelled,
    resync_booking_slices_from_order,
    seat_designators_by_passenger,
)
from backend.crud.db import get_session
from backend.crud.payments import get_completed_payment_for_booking
from backend.crud.refunds import (
    customer_refund_amount,
    get_refund_for_booking,
    refund_blocker,
)
from backend.crud.tickets import get_ticket_by_number
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.models.bookings import Booking, BookingStatus
from backend.models.users import UserInDB
from backend.schemas.bookings import (
    BookingListQueryParams,
    BookingListResponse,
    BookingPublic,
)
from backend.schemas.common import PaginationMeta
from backend.schemas.refunds import (
    CancellationRefundPreview,
    CustomerRefundRead,
    OrderCancellationQuoteResponse,
)
from backend.schemas.duffel_orders import (
    Order,
    OrderCancellationQuote,
    OrderCancellationResponse,
    OrderChangeConfirm,
    OrderChangeCreate,
    OrderChangeOffersResponse,
    OrderChangeRequestResponse,
    OrderChangeResponse,
    OrderChangeSlices,
    OrderCreate,
    OrderResponse,
)
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.duffel_errors import duffel_http_exception
from backend.utils.itinerary_pdf import build_itinerary_pdf
from backend.utils.kafka import kafka_producer
from backend.utils.log_manager import get_app_logger
from backend.utils.security import get_current_user

logger = get_app_logger(__name__)

router = APIRouter(prefix="/booking", tags=["Bookings"])


def _get_owned_booking(
    session: Session, order_id: str, current_user: UserInDB
) -> Booking:
    """Look up a booking by Duffel order ID and verify it belongs to the
    requesting user. 404s (not 403) on a mismatch, so a guessed order_id
    can't be used to probe for its existence."""
    booking = get_booking_by_duffel_order_id(session, order_id)
    if booking is None or booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    return booking


@router.post("/flight-orders", response_model=OrderResponse)
async def flight_order(
    request: OrderCreate,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create an order (booking) from a selected, freshly priced offer.

    IMPORTANT:

    - selected_offers must contain an offer ID from a RECENT search
    - Offers expire quickly (typically within minutes), so call
      /shopping/flight-offers/pricing first and use its amounts
    - passengers must use the IDs issued by the offer request and the
      payment amount/currency must match the offer's total
    """
    try:
        response = await duffel_flight_service.create_flight_order(
            build_order_request_body(request)
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        order = Order.model_validate(response["data"])
        create_booking_from_order(
            session, current_user.id, order, seat_designators_by_passenger(request)
        )
    except Exception:
        # The airline booking already succeeded at this point - a failure
        # persisting our own record must not turn that into an error the
        # caller could mistake for a failed/retriable booking attempt.
        logger.exception(
            "Failed to persist booking for order %s", response.get("data", {}).get("id")
        )

    return response


@router.get("/flight-orders", response_model=BookingListResponse)
async def list_flight_orders(
    params: Annotated[BookingListQueryParams, Query()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List the current user's bookings, most recent first.

    Backed by our own DB (not a live Duffel call), since Duffel's
    /air/orders isn't scoped per end-user - it lists every order in the
    whole Duffel account. Only bookings made through this app appear here.
    """
    filters = dict(
        booking_reference=params.booking_reference,
        origin=params.origin,
        destination=params.destination,
        status=params.status,
    )
    bookings = get_user_bookings(
        session, current_user.id, limit=params.limit, offset=params.offset, **filters
    )
    total = count_user_bookings(session, current_user.id, **filters)
    return BookingListResponse(
        data=bookings,
        meta=PaginationMeta(
            limit=params.limit,
            offset=params.offset,
            total=total,
            has_more=params.offset + params.limit < total,
        ),
    )


@router.get("/flight-orders/by-id/{booking_id}", response_model=BookingPublic)
async def get_flight_order_by_id(
    booking_id: Annotated[uuid.UUID, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get one of the current user's bookings by OUR OWN id (not Duffel's
    order_id, which flight_order_management below uses) - backed by our
    DB, so this includes ticket numbers (BookingPassengerPublic.tickets)
    that Duffel's raw order response doesn't carry in the same shape.
    """
    booking = get_booking(session, booking_id)
    if booking is None or booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    return booking


@router.get("/flight-orders/by-ticket/{ticket_number}", response_model=BookingPublic)
async def get_flight_order_by_ticket_number(
    ticket_number: Annotated[str, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Look up one of the current user's bookings by an airline-issued ticket
    number alone, for a traveler who has the ticket number but not our
    internal booking id handy.
    """
    ticket = get_ticket_by_number(session, ticket_number)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    booking = get_booking(session, ticket.booking_id)
    if booking is None or booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    return booking


@router.get("/flight-orders/by-id/{booking_id}/itinerary.pdf")
async def get_booking_itinerary_pdf(
    booking_id: Annotated[uuid.UUID, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Downloadable e-itinerary/receipt PDF for one of the current user's
    bookings - generated fresh on every request (see utils/itinerary_pdf.py)
    so it always reflects the booking's current state, rather than a
    stale snapshot attached to the confirmation email at send time.
    """
    booking = get_booking(session, booking_id)
    if booking is None or booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    pdf_bytes = build_itinerary_pdf(booking)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="flyt-{booking.booking_reference}.pdf"'
            )
        },
    )


@router.get("/flight-orders/{order_id}", response_model=OrderResponse)
async def flight_order_management(
    order_id: Annotated[str, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get flight order details by order ID.

    Also useful to fetch the order's up-to-date price before paying a held
    order, since re-fetching avoids a `price_changed` error on payment.
    """
    _get_owned_booking(session, order_id, current_user)
    try:
        return await duffel_flight_service.get_flight_order(order_id)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/flight-orders/{order_id}/cancellations",
    response_model=OrderCancellationQuoteResponse,
)
async def request_order_cancellation(
    order_id: Annotated[str, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Request an order cancellation quote.

    IMPORTANT:

    - This does NOT cancel the order; it only creates an unconfirmed quote
      with the refund amount and an expiry
    - Check the order's available_actions includes "cancel" before calling
    - Confirm the quote via the /confirm endpoint before it expires,
      otherwise a new quote must be requested

    Returns Duffel's quote alongside `customer_refund` - what the person
    actually gets back. Those are different numbers (Duffel refunds
    flyt's balance, and its figure can exceed what the customer paid once
    a discount code is involved), and the customer-facing UI must quote
    the latter or it promises money that will never arrive.
    """
    booking = _get_owned_booking(session, order_id, current_user)
    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking has already been cancelled.",
        )
    try:
        response = await duffel_flight_service.request_order_cancellation(order_id)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    quote = OrderCancellationQuote.model_validate(response["data"])
    return OrderCancellationQuoteResponse(
        data=quote,
        customer_refund=_preview_customer_refund(session, booking, quote),
    )


def _preview_customer_refund(
    session: Session, booking: Booking, quote: OrderCancellationQuote
) -> CancellationRefundPreview:
    """Runs the real refund rules (crud/refunds.py) against a quote that
    hasn't been confirmed yet, so what the customer is shown before
    cancelling is exactly what they'd be paid after."""
    payment = get_completed_payment_for_booking(session, booking.id)
    if payment is None:
        # No payment flyt collected - nothing it can send back itself.
        return CancellationRefundPreview(
            amount="0.00",
            currency=quote.refund_currency or booking.total_currency,
            to_original_payment_method=False,
            manual_payout_reason="No completed payment was found for this booking.",
        )

    amount = customer_refund_amount(payment, quote.refund_amount)
    blocker = refund_blocker(payment, amount) if float(amount) > 0 else None
    return CancellationRefundPreview(
        amount=amount,
        currency=payment.currency,
        to_original_payment_method=blocker is None and float(amount) > 0,
        manual_payout_reason=blocker,
    )


@router.get(
    "/flight-orders/by-id/{booking_id}/refund", response_model=CustomerRefundRead
)
async def get_booking_refund(
    booking_id: uuid.UUID,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The traveller's own view of the refund owed on a cancelled
    booking. 404s when there isn't one - a booking that was never
    cancelled, or a fully non-refundable fare where nothing is owed."""
    booking = get_booking(session, booking_id)
    if booking is None or booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    refund = get_refund_for_booking(session, booking_id)
    if refund is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No refund has been recorded for this booking.",
        )
    return CustomerRefundRead.from_refund(refund)


@router.post(
    "/flight-orders/{order_id}/cancellations/{order_cancellation_id}/confirm",
    response_model=OrderCancellationResponse,
)
async def confirm_order_cancellation(
    order_id: Annotated[str, Path()],
    order_cancellation_id: Annotated[str, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Confirm a previously requested order cancellation quote.

    Finalizes the cancellation and initiates the refund to the original
    form of payment. order_id is accepted for a predictable, RESTful URL,
    though Duffel only requires the cancellation ID to confirm.
    """
    booking = _get_owned_booking(session, order_id, current_user)
    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking has already been cancelled.",
        )
    try:
        response = await duffel_flight_service.confirm_order_cancellation(
            order_cancellation_id
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # mark_booking_cancelled commits before this runs, so it's safe to
    # publish immediately - the consumer (backend/workers/
    # kafka_consumer.py) never needs to look the booking up itself, since
    # everything create_notification needs is already in the event.
    #
    # refund_amount is Duffel's, i.e. what comes back to *flyt's* balance
    # - the consumer turns it into what the customer gets (see
    # crud/refunds.py). Carried on the event so the refund never needs a
    # second, possibly-expired round trip to Duffel to find it out.
    mark_booking_cancelled(session, booking)
    quote = OrderCancellationQuote.model_validate(response["data"])
    kafka_producer.publish_event(
        KafkaTopics.BOOKING_EVENTS,
        KafkaEventTypes.BOOKING_CANCELLED,
        {
            "user_id": current_user.id,
            "booking_id": booking.id,
            "booking_reference": booking.booking_reference,
            "duffel_refund_amount": quote.refund_amount,
            "duffel_refund_currency": quote.refund_currency,
        },
    )
    return response


# Order changes - Duffel's 4-step flow: request a change -> review priced
# offers -> create a pending change from a chosen offer -> confirm with
# payment. Unlike cancellation, a confirmed change can alter the booking's
# actual flights, so confirm_order_change re-syncs our persisted slices
# from Duffel afterward (see crud/bookings.py's resync_booking_slices_from_order).


@router.post(
    "/flight-orders/{order_id}/change-requests",
    response_model=OrderChangeRequestResponse,
)
async def create_order_change_request(
    order_id: Annotated[str, Path()],
    request: OrderChangeSlices,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Step 1: describe which slice(s) to remove and what new slice(s) to
    search for in their place. Doesn't touch the order yet - review the
    resulting offers (step 2) before committing to anything.
    """
    _get_owned_booking(session, order_id, current_user)
    try:
        return await duffel_flight_service.create_order_change_request(
            order_id, request.model_dump(mode="json", exclude_none=True)
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/flight-orders/{order_id}/change-requests/{order_change_request_id}/offers",
    response_model=OrderChangeOffersResponse,
)
async def list_order_change_offers(
    order_id: Annotated[str, Path()],
    order_change_request_id: Annotated[str, Path()],
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Step 2: the priced ways to satisfy a change request - the customer
    picks one to proceed with (step 3)."""
    _get_owned_booking(session, order_id, current_user)
    try:
        return await duffel_flight_service.list_order_change_offers(
            order_change_request_id
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/flight-orders/{order_id}/changes", response_model=OrderChangeResponse)
async def create_order_change(
    order_id: Annotated[str, Path()],
    request: OrderChangeCreate,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Step 3: create a pending change from a chosen offer - still not
    confirmed/charged. Review the returned change_total_amount/
    penalty_total_amount with the customer before confirming (step 4)."""
    _get_owned_booking(session, order_id, current_user)
    try:
        return await duffel_flight_service.create_order_change(
            request.selected_order_change_offer
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/flight-orders/{order_id}/changes/{order_change_id}/confirm",
    response_model=OrderChangeResponse,
)
async def confirm_order_change(
    order_id: Annotated[str, Path()],
    order_change_id: Annotated[str, Path()],
    request: OrderChangeConfirm,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Step 4: pay for and finalize the pending change. On success,
    re-fetches the order and re-syncs our persisted booking's flights/
    total, since they may now differ from what was recorded at booking
    time."""
    booking = _get_owned_booking(session, order_id, current_user)
    try:
        response = await duffel_flight_service.confirm_order_change(
            order_change_id,
            request.payment.model_dump(mode="json", exclude_none=True),
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        refreshed = await duffel_flight_service.get_flight_order(order_id)
        order = Order.model_validate(refreshed["data"])
        resync_booking_slices_from_order(session, booking, order)
    except Exception:
        # The change is already confirmed and paid for with Duffel at this
        # point - a failure re-syncing our own record must not be mistaken
        # for a failed change.
        logger.exception(
            "Failed to re-sync booking %s after confirmed order change %s",
            booking.id,
            order_change_id,
        )

    # resync_booking_slices_from_order (when it succeeds) commits before
    # this runs, and the event below doesn't need the resynced slices
    # anyway (just the reference text), so this is safe to publish even
    # when the resync above failed.
    kafka_producer.publish_event(
        KafkaTopics.BOOKING_EVENTS,
        KafkaEventTypes.BOOKING_CHANGE_CONFIRMED,
        {
            "user_id": current_user.id,
            "booking_id": booking.id,
            "booking_reference": booking.booking_reference,
        },
    )

    return response
