import uuid

from fastapi import (
    APIRouter,
    HTTPException,
    Response,
    status,
    Query,
    Depends,
    Path,
)
from sqlmodel import Session

from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.cache import (
    build_places_cache_key,
    build_search_cache_key,
    build_seatmap_cache_key,
    redis_cache,
)
from backend.crud.bookings import (
    count_user_bookings,
    create_booking_from_order,
    get_booking,
    get_booking_by_duffel_order_id,
    get_user_bookings,
    mark_booking_cancelled,
)
from backend.crud.db import get_session
from backend.crud.tickets import get_ticket_by_number
from backend.schemas.bookings import (
    BookingListQueryParams,
    BookingListResponse,
    BookingPublic,
)
from backend.schemas.common import PaginationMeta
from backend.schemas.duffel_flights import (
    FlightSearchAndListQueryParams,
    FlightSearchResponse,
    OfferListQueryParams,
    OfferPriceRequest,
    OfferRequestCreate,
    OfferResponse,
    Order,
    OrderCancellationResponse,
    OrderCreate,
    OrderResponse,
    PlaceSuggestionsQuery,
    PlaceSuggestionsResponse,
)
from backend.utils.guard import guard_deco
from backend.utils.itinerary_pdf import build_itinerary_pdf
from backend.utils.log_manager import get_app_logger
from backend.utils.offer_filtering import build_flight_search_response
from backend.utils.pricing import apply_markup_to_offer_dict

from typing import Annotated
from backend.utils.security import get_current_user
from backend.models.users import UserInDB
from backend.models.bookings import Booking, BookingStatus

logger = get_app_logger(__name__)

router = APIRouter()

CACHE_TTL_SECONDS = 60
PLACES_CACHE_TTL_SECONDS = 60 * 60 * 24

# Per-IP only: both endpoints are unauthenticated. Search is cache-backed
# (CACHE_TTL_SECONDS) but a cache miss still hits Duffel directly, and
# pricing has no cache at all - both are real per-request Duffel cost, so
# this guards against a sweep that varies params just enough to always
# miss the cache. Enforced via guard_deco.rate_limit decorators below
# (fastapi-guard, IP-keyed) rather than our own limiter - see utils/guard.py.
SEARCH_IP_LIMIT = 30
PRICING_IP_LIMIT = 30
SHOPPING_WINDOW_SECONDS = 60


def _duffel_http_exception(error: DuffelAPIError) -> HTTPException:
    """Map a Duffel error to an HTTP response, preserving client errors and
    reporting upstream (5xx) failures as a bad gateway."""
    status_code = (
        error.status_code
        if 400 <= error.status_code < 500
        else status.HTTP_502_BAD_GATEWAY
    )
    return HTTPException(status_code=status_code, detail=error.errors or str(error))


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


async def _search_flights_cached(request: OfferRequestCreate) -> dict:
    """Fetch (or read from cache) the full, unfiltered Duffel offer list for
    a search. Filtering/sorting/pagination are deliberately NOT part of the
    cache key - they're applied afterwards in build_flight_search_response,
    so every filter/sort/page combination of the same search reuses this
    one cached response instead of hitting Duffel again."""
    cache_key = build_search_cache_key(request)
    cached_response = redis_cache.get(cache_key)
    if cached_response is not None:
        return cached_response

    request_body = request.model_dump(mode="json", exclude_none=True)
    response = await duffel_flight_service.search_flights(request_body)
    redis_cache.set(cache_key, response, CACHE_TTL_SECONDS)
    return response


@router.post("/shopping/flight-offers", response_model=FlightSearchResponse)
@guard_deco.rate_limit(requests=SEARCH_IP_LIMIT, window=SHOPPING_WINDOW_SECONDS)
async def search_flights(
    request: OfferRequestCreate,
    params: Annotated[OfferListQueryParams, Query()],
):
    """
    Search for flights by creating a Duffel offer request.

    Accepts slices (origin/destination/departure date), passengers and an
    optional cabin class, and returns one page of matching offers (grouped
    by route) plus facets and pagination info. The full result is cached in
    Redis for one minute per unique search request; `params` (sort,
    airlines, max_stops, price_max, limit, offset) slice/filter that cached
    result and don't affect the cache key.
    """
    try:
        response = await _search_flights_cached(request)
        return build_flight_search_response(response, params)
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during flight search")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Flight search failed: {str(e)}",
        )


@router.get("/shopping/flight-offers", response_model=FlightSearchResponse)
@guard_deco.rate_limit(requests=SEARCH_IP_LIMIT, window=SHOPPING_WINDOW_SECONDS)
async def search_flights_2(
    params: Annotated[FlightSearchAndListQueryParams, Query()],
):
    """
    Simple flight search via query parameters.

    Duffel has no GET search endpoint, so the parameters are translated into
    an offer request (slices + passengers) and posted to Duffel. Shares its
    cache namespace with the POST endpoint, since an equivalent request via
    either path resolves to the same offer request body. `params` combines
    both the shopping fields (origin/destination/...) and the sort/filter/
    pagination fields (FastAPI only flattens one Query() model per route -
    see FlightSearchAndListQueryParams's docstring) - only the former go
    into the offer request itself, the latter are applied afterwards, same
    as search_flights.
    """
    offer_request = params.to_offer_request()
    try:
        response = await _search_flights_cached(offer_request)
        return build_flight_search_response(response, params)
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/shopping/flight-offers/pricing", response_model=OfferResponse)
@guard_deco.rate_limit(requests=PRICING_IP_LIMIT, window=SHOPPING_WINDOW_SECONDS)
async def confirm_price(request: OfferPriceRequest):
    """
    Confirm the live price of a selected offer.

    Duffel has no separate pricing API: fetching the single offer again
    returns its up-to-date total_amount/total_currency (plus available
    services). Offers expire, so always confirm shortly before booking.
    """
    try:
        response = await duffel_flight_service.confirm_price(request.offer_id)
        response["data"] = apply_markup_to_offer_dict(response["data"])
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Price confirmation failed: {str(e)}"
        )


@router.post("/booking/flight-orders", response_model=OrderResponse)
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
    seat_by_passenger_id = {
        p.id: p.seat_designator for p in request.passengers if p.seat_designator
    }

    # seat_designator is our own field for the local booking record only -
    # Duffel doesn't recognize it, so it's stripped from the payload sent
    # to them (see OrderPassenger.seat_designator's docstring). The seat's
    # actual reservation with the airline instead goes through
    # seat_service_id, collected here into the top-level `services` field
    # Duffel expects (see OrderPassenger.seat_service_id's docstring).
    request_body = request.model_dump(mode="json", exclude_none=True)
    seat_services = []
    for passenger in request_body.get("passengers", []):
        passenger.pop("seat_designator", None)
        seat_service_id = passenger.pop("seat_service_id", None)
        if seat_service_id:
            seat_services.append({"id": seat_service_id, "quantity": 1})
    if seat_services:
        request_body.setdefault("services", [])
        request_body["services"].extend(seat_services)

    try:
        response = await duffel_flight_service.create_flight_order(request_body)
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        order = Order.model_validate(response["data"])
        create_booking_from_order(session, current_user.id, order, seat_by_passenger_id)
    except Exception:
        # The airline booking already succeeded at this point - a failure
        # persisting our own record must not turn that into an error the
        # caller could mistake for a failed/retriable booking attempt.
        logger.exception(
            "Failed to persist booking for order %s", response.get("data", {}).get("id")
        )

    return response


@router.get("/shopping/seatmaps")
async def view_seat_map_get(offer_id: Annotated[str, Query()]):
    """
    Get seat maps for an offer.

    Duffel exposes seat maps per offer (before booking), not per order,
    so this takes an offer_id instead of the old flightOrderId. Cached
    briefly per offer_id, since it's a read-only, offer-scoped lookup.
    """
    cache_key = build_seatmap_cache_key(offer_id)
    cached_response = redis_cache.get(cache_key)
    if cached_response is not None:
        return cached_response
    try:
        response = await duffel_flight_service.view_seat_map(offer_id)
        redis_cache.set(cache_key, response, CACHE_TTL_SECONDS)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/shopping/places", response_model=PlaceSuggestionsResponse)
async def search_places(params: Annotated[PlaceSuggestionsQuery, Query()]):
    """
    Search for airports and cities.

    Give either `query` (a free-text name or IATA code, for autocomplete)
    or `lat`+`lng`+`rad` (a geographic radius in meters), not both. Cached
    for a day, since airport/city reference data rarely changes.
    """
    try:
        cache_key = build_places_cache_key(params)
        cached_response = redis_cache.get(cache_key)
        if cached_response is not None:
            return cached_response

        query_params = params.model_dump(mode="json", exclude_none=True)
        response = await duffel_flight_service.search_places(query_params)
        redis_cache.set(cache_key, response, PLACES_CACHE_TTL_SECONDS)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/booking/flight-orders", response_model=BookingListResponse)
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


@router.get("/booking/flight-orders/by-id/{booking_id}", response_model=BookingPublic)
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


@router.get(
    "/booking/flight-orders/by-ticket/{ticket_number}", response_model=BookingPublic
)
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


@router.get("/booking/flight-orders/by-id/{booking_id}/itinerary.pdf")
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


@router.get("/booking/flight-orders/{order_id}", response_model=OrderResponse)
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
        response = await duffel_flight_service.get_flight_order(order_id)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/booking/flight-orders/{order_id}/cancellations",
    response_model=OrderCancellationResponse,
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
    """
    booking = _get_owned_booking(session, order_id, current_user)
    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking has already been cancelled.",
        )
    try:
        response = await duffel_flight_service.request_order_cancellation(order_id)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/booking/flight-orders/{order_id}/cancellations/{order_cancellation_id}/confirm",
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
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    mark_booking_cancelled(session, booking)
    return response
