from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from backend.crud import flights as flights_crud
from backend.crud.bookings import get_popular_routes
from backend.crud.db import get_session
from backend.external_services.flight import DuffelAPIError
from backend.schemas.bookings import PopularRoute
from backend.schemas.duffel_flights import (
    FlightSearchAndListQueryParams,
    FlightSearchResponse,
    OfferListQueryParams,
    OfferPassengerUpdate,
    OfferPriceRequest,
    OfferRequestCreate,
    OfferResponse,
)
from backend.schemas.duffel_places import (
    PlaceSuggestionsQuery,
    PlaceSuggestionsResponse,
)
from backend.utils.duffel_errors import duffel_http_exception
from backend.utils.guard import guard_deco
from backend.utils.log_manager import get_app_logger
from backend.utils.offer_filtering import build_flight_search_response
from backend.utils.pricing import get_active_markup_rate

# A single booking must never look "popular" to a customer - much higher
# bar than the staff dashboard's (routers/admin.py, min_bookings=1).
PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS = 5

logger = get_app_logger(__name__)

router = APIRouter()

# Per-IP only: both endpoints are unauthenticated. Search is cache-backed
# (crud/flights.py's CACHE_TTL_SECONDS) but a cache miss still hits Duffel
# directly, and pricing has no cache at all - both are real per-request
# Duffel cost, so this guards against a sweep that varies params just
# enough to always miss the cache. Enforced via guard_deco.rate_limit
# decorators below (fastapi-guard, IP-keyed) rather than our own limiter -
# see utils/guard.py.
SEARCH_IP_LIMIT = 30
PRICING_IP_LIMIT = 30
SHOPPING_WINDOW_SECONDS = 60

# Places is debounced client-side (~250ms, see PlaceAutocomplete.tsx) but
# unlike search/pricing, a cache hit here still requires a distinct exact
# query string - every new character while typing a city name is a
# cache-miss-by-construction, so this needs its own, higher budget rather
# than reusing SEARCH_IP_LIMIT.
PLACES_IP_LIMIT = 60
PLACES_WINDOW_SECONDS = 60


@router.post("/shopping/flight-offers", response_model=FlightSearchResponse)
@guard_deco.rate_limit(requests=SEARCH_IP_LIMIT, window=SHOPPING_WINDOW_SECONDS)
async def search_flights(
    request: OfferRequestCreate,
    params: Annotated[OfferListQueryParams, Query()],
    session: Session = Depends(get_session),
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
        response = await flights_crud.search_flights_cached(request)
        markup_rate = get_active_markup_rate(session)
        return build_flight_search_response(response, params, markup_rate)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
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
    session: Session = Depends(get_session),
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
        response = await flights_crud.search_flights_cached(offer_request)
        markup_rate = get_active_markup_rate(session)
        return build_flight_search_response(response, params, markup_rate)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/shopping/flight-offers/pricing", response_model=OfferResponse)
@guard_deco.rate_limit(requests=PRICING_IP_LIMIT, window=SHOPPING_WINDOW_SECONDS)
async def confirm_price(
    request: OfferPriceRequest, session: Session = Depends(get_session)
):
    """
    Confirm the live price of a selected offer.

    Duffel has no separate pricing API: fetching the single offer again
    returns its up-to-date total_amount/total_currency (plus available
    services). Offers expire, so always confirm shortly before booking.
    """
    try:
        markup_rate = get_active_markup_rate(session)
        return await flights_crud.confirm_price_with_markup(
            request.offer_id, markup_rate
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Price confirmation failed: {str(e)}"
        )


@router.patch(
    "/shopping/flight-offers/{offer_id}/passengers/{offer_passenger_id}",
    response_model=OfferResponse,
)
@guard_deco.rate_limit(requests=PRICING_IP_LIMIT, window=SHOPPING_WINDOW_SECONDS)
async def update_offer_passenger(
    offer_id: str,
    offer_passenger_id: str,
    request: OfferPassengerUpdate,
    session: Session = Depends(get_session),
):
    """
    Attach loyalty programme accounts to a passenger on an already-priced
    offer, then return the offer re-fetched (and re-marked-up) - Duffel
    may reveal a loyalty-discounted fare, only reflected by re-fetching
    after the update. Call this after collecting passenger names/loyalty
    numbers but before final checkout, so any discount is reflected in
    what the customer is actually charged.
    """
    try:
        markup_rate = get_active_markup_rate(session)
        return await flights_crud.update_offer_passenger_loyalty(
            offer_id,
            offer_passenger_id,
            request.model_dump(mode="json", exclude_none=True),
            markup_rate,
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/shopping/seatmaps")
async def view_seat_map_get(offer_id: Annotated[str, Query()]):
    """
    Get seat maps for an offer.

    Duffel exposes seat maps per offer (before booking), not per order,
    so this takes an offer_id instead of the old flightOrderId. Cached
    briefly per offer_id, since it's a read-only, offer-scoped lookup.
    """
    try:
        return await flights_crud.get_seat_map(offer_id)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/shopping/places", response_model=PlaceSuggestionsResponse)
@guard_deco.rate_limit(requests=PLACES_IP_LIMIT, window=PLACES_WINDOW_SECONDS)
async def search_places(params: Annotated[PlaceSuggestionsQuery, Query()]):
    """
    Search for airports and cities.

    Give either `query` (a free-text name or IATA code, for autocomplete)
    or `lat`+`lng`+`rad` (a geographic radius in meters), not both. Cached
    for a day, since airport/city reference data rarely changes.
    """
    try:
        return await flights_crud.search_places(params)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/flights/popular-destinations", response_model=list[PopularRoute])
async def popular_destinations(
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    session: Session = Depends(get_session),
):
    """Public, no auth - aggregated from real BookingSlice data (our own
    DB, not Duffel), with a real-signal threshold
    (PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS) so this app's early, thin booking
    volume never surfaces a single booking as a fabricated 'popular
    destination'. An empty list is a completely normal response - the
    frontend hides the whole section rather than showing an empty box."""
    rows = get_popular_routes(
        session, limit=limit, min_bookings=PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS
    )
    return [
        PopularRoute(
            origin_iata_code=origin_code,
            origin_city_name=origin_city,
            destination_iata_code=destination_code,
            destination_city_name=destination_city,
            booking_count=count,
            destination_image_url=image.image_url if image else None,
            destination_image_attribution_name=image.photographer_name
            if image
            else None,
            destination_image_attribution_url=image.photographer_profile_url
            if image
            else None,
        )
        for origin_code, origin_city, destination_code, destination_city, count, image in rows
    ]
