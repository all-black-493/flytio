from fastapi import APIRouter, HTTPException, status, Query, Depends, Path
from sqlmodel import Session

from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.cache import (
    build_places_cache_key,
    build_search_cache_key,
    build_seatmap_cache_key,
    redis_cache,
)
from backend.crud.bookings import (
    create_booking_from_order,
    get_booking_by_duffel_order_id,
    get_user_bookings,
    mark_booking_cancelled,
)
from backend.crud.db import get_session
from backend.schemas.bookings import BookingListQueryParams, BookingPublic
from backend.schemas.duffel_flights import (
    FlightSearchQueryParams,
    FlightSearchResponse,
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

from typing import Annotated
from backend.utils.security import get_current_user
from backend.models.users import UserInDB
from backend.models.bookings import Booking

router = APIRouter()

CACHE_TTL_SECONDS = 60
PLACES_CACHE_TTL_SECONDS = 60 * 60 * 24


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


@router.post("/shopping/flight-offers", response_model=FlightSearchResponse)
async def search_flights(request: OfferRequestCreate):
    """
    Search for flights by creating a Duffel offer request.

    Accepts slices (origin/destination/departure date), passengers and an
    optional cabin class, and returns the offer request with its offers.
    Responses are cached in Redis for one minute per unique search request.
    """
    try:
        cache_key = build_search_cache_key(request)
        cached_response = redis_cache.get(cache_key)
        if cached_response is not None:
            return cached_response

        request_body = request.model_dump(mode="json", exclude_none=True)
        response = await duffel_flight_service.search_flights(request_body)
        redis_cache.set(cache_key, response, CACHE_TTL_SECONDS)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        print("Error: ", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Flight search failed: {str(e)}",
        )


@router.get("/shopping/flight-offers", response_model=FlightSearchResponse)
async def search_flights_2(params: Annotated[FlightSearchQueryParams, Query()]):
    """
    Simple flight search via query parameters.

    Duffel has no GET search endpoint, so the parameters are translated into
    an offer request (slices + passengers) and posted to Duffel. Shares its
    cache namespace with the POST endpoint, since an equivalent request via
    either path resolves to the same offer request body.
    """
    offer_request = params.to_offer_request()
    try:
        cache_key = build_search_cache_key(offer_request)
        cached_response = redis_cache.get(cache_key)
        if cached_response is not None:
            return cached_response

        request_body = offer_request.model_dump(mode="json", exclude_none=True)
        response = await duffel_flight_service.search_flights(request_body)
        redis_cache.set(cache_key, response, CACHE_TTL_SECONDS)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/shopping/flight-offers/pricing", response_model=OfferResponse)
async def confirm_price(request: OfferPriceRequest):
    """
    Confirm the live price of a selected offer.

    Duffel has no separate pricing API: fetching the single offer again
    returns its up-to-date total_amount/total_currency (plus available
    services). Offers expire, so always confirm shortly before booking.
    """
    try:
        response = await duffel_flight_service.confirm_price(request.offer_id)
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
    request_body = request.model_dump(mode="json", exclude_none=True)
    try:
        response = await duffel_flight_service.create_flight_order(request_body)
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        order = Order.model_validate(response["data"])
        create_booking_from_order(session, current_user.id, order)
    except Exception as e:
        # The airline booking already succeeded at this point - a failure
        # persisting our own record must not turn that into an error the
        # caller could mistake for a failed/retriable booking attempt.
        print(
            f"Failed to persist booking for order {response.get('data', {}).get('id')}: {e}"
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


@router.get("/booking/flight-orders", response_model=list[BookingPublic])
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
    return get_user_bookings(
        session,
        current_user.id,
        booking_reference=params.booking_reference,
        origin=params.origin,
        destination=params.destination,
        status=params.status,
        limit=params.limit,
        offset=params.offset,
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
    _get_owned_booking(session, order_id, current_user)
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
