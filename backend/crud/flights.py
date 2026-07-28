"""Service layer for the Duffel Flights product surface's shopping side
(search/price/seatmap/places) - external-API + caching orchestration,
kept out of routers/flights.py so route handlers stay thin HTTP glue.
Order creation/management lives in crud/bookings.py instead, alongside
the DB persistence it's paired with.
"""

from backend.external_services.cache import (
    build_places_cache_key,
    build_search_cache_key,
    build_seatmap_cache_key,
    redis_cache,
)
from backend.external_services.flight import duffel_flight_service
from backend.schemas.duffel_flights import OfferRequestCreate
from backend.schemas.duffel_places import PlaceSuggestionsQuery
from backend.utils.pricing import apply_markup_to_offer_dict

CACHE_TTL_SECONDS = 60
PLACES_CACHE_TTL_SECONDS = 60 * 60 * 24


async def search_flights_cached(request: OfferRequestCreate) -> dict:
    """Fetch (or read from cache) the full, unfiltered Duffel offer list
    for a search. Filtering/sorting/pagination are deliberately NOT part
    of the cache key - they're applied afterwards in
    utils/offer_filtering.py's build_flight_search_response, so every
    filter/sort/page combination of the same search reuses this one
    cached response instead of hitting Duffel again."""
    cache_key = build_search_cache_key(request)
    cached_response = redis_cache.get(cache_key)
    if cached_response is not None:
        return cached_response

    request_body = request.model_dump(mode="json", exclude_none=True)
    response = await duffel_flight_service.search_flights(request_body)
    redis_cache.set(cache_key, response, CACHE_TTL_SECONDS)
    return response


async def confirm_price_with_markup(offer_id: str) -> dict:
    """Re-fetches an offer's live price from Duffel (Duffel has no
    separate pricing endpoint - refetching the offer returns its
    up-to-date total_amount/total_currency) and applies flyt's markup
    before returning it - the one place this happens, so the pricing
    endpoint and checkout's price reconfirmation can never drift apart on
    it."""
    response = await duffel_flight_service.confirm_price(offer_id)
    response["data"] = apply_markup_to_offer_dict(response["data"])
    return response


async def get_seat_map(offer_id: str) -> dict:
    """Seat maps are looked up per offer (pre-booking) in Duffel. Cached
    briefly per offer_id, since it's a read-only, offer-scoped lookup."""
    cache_key = build_seatmap_cache_key(offer_id)
    cached_response = redis_cache.get(cache_key)
    if cached_response is not None:
        return cached_response
    response = await duffel_flight_service.view_seat_map(offer_id)
    redis_cache.set(cache_key, response, CACHE_TTL_SECONDS)
    return response


async def search_places(params: PlaceSuggestionsQuery) -> dict:
    """Cached for a day, since airport/city reference data rarely
    changes."""
    cache_key = build_places_cache_key(params)
    cached_response = redis_cache.get(cache_key)
    if cached_response is not None:
        return cached_response

    query_params = params.model_dump(mode="json", exclude_none=True)
    response = await duffel_flight_service.search_places(query_params)
    redis_cache.set(cache_key, response, PLACES_CACHE_TTL_SECONDS)
    return response


async def update_offer_passenger_loyalty(
    offer_id: str, offer_passenger_id: str, update: dict
) -> dict:
    """Attaches loyalty programme accounts to a specific passenger on an
    already-priced offer (PATCH /air/offers/{offer_id}/passengers/
    {offer_passenger_id}) and returns the updated offer, re-marked-up -
    Duffel may reveal a loyalty-discounted fare, only reflected by
    re-fetching after the update, which this does in one call for the
    caller's convenience."""
    await duffel_flight_service.update_offer_passenger(
        offer_id, offer_passenger_id, update
    )
    return await confirm_price_with_markup(offer_id)
