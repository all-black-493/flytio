from fastapi import APIRouter, HTTPException, status, Query, Depends, Path

from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.utils.cache import make_cache_key, get_cached, set_cached
from backend.schemas.duffel_flights import (
    FlightSearchResponse,
    OfferPriceRequest,
    OfferRequestCreate,
    OfferResponse,
    OrderCancellationResponse,
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    SearchPassenger,
    SlicePlan,
)

from typing import Annotated
from backend.utils.security import get_current_user
from backend.models.users import UserInDB

router = APIRouter()

FLIGHT_SEARCH_CACHE_TTL_SECONDS = 60


def _duffel_http_exception(error: DuffelAPIError) -> HTTPException:
    """Map a Duffel error to an HTTP response, preserving client errors and
    reporting upstream (5xx) failures as a bad gateway."""
    status_code = (
        error.status_code
        if 400 <= error.status_code < 500
        else status.HTTP_502_BAD_GATEWAY
    )
    return HTTPException(status_code=status_code, detail=error.errors or str(error))


@router.post("/shopping/flight-offers", response_model=FlightSearchResponse)
async def search_flights(request: OfferRequestCreate):
    """
    Search for flights by creating a Duffel offer request.

    Accepts slices (origin/destination/departure date), passengers and an
    optional cabin class, and returns the offer request with its offers.
    Responses are cached in Redis for one minute per unique search request.
    """
    try:
        request_body = request.model_dump(mode="json", exclude_none=True)

        cache_key = make_cache_key("flights:search", request_body)
        cached_response = await get_cached(cache_key)
        if cached_response is not None:
            return cached_response
        response = await duffel_flight_service.search_flights(request_body)
        await set_cached(cache_key, response, FLIGHT_SEARCH_CACHE_TTL_SECONDS)

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
async def search_flights_2(
    origin: Annotated[str, Query(min_length=3, max_length=3)],
    destination: Annotated[str, Query(min_length=3, max_length=3)],
    departure_date: Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")],
    return_date: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
    adults: Annotated[int, Query(ge=1)] = 1,
    children: Annotated[int, Query(ge=0)] = 0,
    infants: Annotated[int, Query(ge=0)] = 0,
    cabin_class: Annotated[str | None, Query()] = None,
    max_connections: Annotated[int | None, Query(ge=0, le=2)] = None,
):
    """
    Simple flight search via query parameters.

    Duffel has no GET search endpoint, so the parameters are translated into
    an offer request (slices + passengers) and posted to Duffel.
    """
    slices = [
        SlicePlan(origin=origin, destination=destination, departure_date=departure_date)
    ]
    if return_date:
        slices.append(
            SlicePlan(
                origin=destination, destination=origin, departure_date=return_date
            )
        )
    passengers = (
        [SearchPassenger(type="adult")] * adults
        + [SearchPassenger(type="child")] * children
        + [SearchPassenger(type="infant_without_seat")] * infants
    )
    offer_request = OfferRequestCreate(
        slices=slices,
        passengers=passengers,
        cabin_class=cabin_class,
        max_connections=max_connections,
    )
    try:
        response = await duffel_flight_service.search_flights(
            offer_request.model_dump(mode="json", exclude_none=True)
        )
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
    request: OrderCreate, current_user: UserInDB = Depends(get_current_user)
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
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/shopping/seatmaps")
async def view_seat_map_get(offer_id: Annotated[str, Query()]):
    """
    Get seat maps for an offer.

    Duffel exposes seat maps per offer (before booking), not per order,
    so this takes an offer_id instead of the old flightOrderId.
    """
    try:
        response = await duffel_flight_service.view_seat_map(offer_id)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/booking/flight-orders", response_model=OrderListResponse)
async def list_flight_orders(
    current_user: UserInDB = Depends(get_current_user),
    booking_reference: Annotated[str | None, Query()] = None,
    awaiting_payment: Annotated[bool | None, Query()] = None,
    origin: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
    destination: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
    sort: Annotated[
        str | None,
        Query(
            description="created_at, -created_at, payment_required_by or -payment_required_by"
        ),
    ] = None,
    limit: Annotated[int | None, Query(ge=1, le=200)] = None,
    before: Annotated[str | None, Query()] = None,
    after: Annotated[str | None, Query()] = None,
):
    """
    List orders, most recent first, with optional filters and cursor pagination.
    """
    params = {
        "booking_reference": booking_reference,
        "awaiting_payment": awaiting_payment,
        "origin": origin,
        "destination": destination,
        "sort": sort,
        "limit": limit,
        "before": before,
        "after": after,
    }
    params = {k: v for k, v in params.items() if v is not None}
    try:
        response = await duffel_flight_service.list_flight_orders(params)
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/booking/flight-orders/{order_id}", response_model=OrderResponse)
async def flight_order_management(
    order_id: Annotated[str, Path()],
    current_user: UserInDB = Depends(get_current_user),
):
    """
    Get flight order details by order ID.

    Also useful to fetch the order's up-to-date price before paying a held
    order, since re-fetching avoids a `price_changed` error on payment.
    """
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
):
    """
    Confirm a previously requested order cancellation quote.

    Finalizes the cancellation and initiates the refund to the original
    form of payment. order_id is accepted for a predictable, RESTful URL,
    though Duffel only requires the cancellation ID to confirm.
    """
    try:
        response = await duffel_flight_service.confirm_order_cancellation(
            order_cancellation_id
        )
        return response
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
