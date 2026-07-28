"""Duffel Stays (accommodation) API - FOUNDATION ONLY.

Search -> rates -> quote -> booking, proxied straight through to Duffel
(external_services/stay.py) with no local persistence: no Stay/StayBooking
DB model, no ownership/auth linking a booking to a flyt user, no
confirmation email, none of the CRUD layer routers/flights.py has for
flight bookings. A stays booking made through this API today exists only
in Duffel's system, not in our own DB or account pages - deliberately
scoped this way (backend service only) as the first step of a larger
stays sub-project, not a production-ready booking path.

Unauthenticated for now, matching flights' shopping endpoints
(search/pricing) rather than its booking endpoint - once persistence and
account ownership are built, booking creation here should require auth
the same way POST /booking/flight-orders does.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status

from backend.external_services.stay import DuffelAPIError, duffel_stay_service
from backend.schemas.duffel_stays import (
    StaysBookingCreate,
    StaysQuoteRequest,
    StaysSearchRequest,
)
from backend.utils.guard import guard_deco

router = APIRouter(prefix="/stays")

STAYS_IP_LIMIT = 20
STAYS_WINDOW_SECONDS = 60


def _duffel_http_exception(error: DuffelAPIError) -> HTTPException:
    status_code = (
        error.status_code
        if 400 <= error.status_code < 500
        else status.HTTP_502_BAD_GATEWAY
    )
    return HTTPException(status_code=status_code, detail=error.errors or str(error))


@router.post("/search")
@guard_deco.rate_limit(requests=STAYS_IP_LIMIT, window=STAYS_WINDOW_SECONDS)
async def search_stays(request: StaysSearchRequest):
    """Step 1 of 4: search accommodation near a location for given dates
    and guest counts. Returns Duffel's raw search response - each result's
    id is what fetch_rates below needs."""
    try:
        return await duffel_stay_service.search_stays(
            request.model_dump(mode="json", exclude_none=True)
        )
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)


@router.post("/search-results/{search_result_id}/rates")
@guard_deco.rate_limit(requests=STAYS_IP_LIMIT, window=STAYS_WINDOW_SECONDS)
async def fetch_stay_rates(search_result_id: Annotated[str, Path()]):
    """Step 2 of 4: the full list of bookable room rates for one
    accommodation from a search result. Each rate's id is what
    create_quote below needs."""
    try:
        return await duffel_stay_service.fetch_rates(search_result_id)
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)


@router.post("/quotes")
@guard_deco.rate_limit(requests=STAYS_IP_LIMIT, window=STAYS_WINDOW_SECONDS)
async def create_stay_quote(request: StaysQuoteRequest):
    """Step 3 of 4: re-validates a rate is still purchasable and locks its
    price. Returns a quote_id, required to book and only valid briefly -
    call this shortly before create_stay_booking."""
    try:
        return await duffel_stay_service.create_quote(request.rate_id)
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
@guard_deco.rate_limit(requests=STAYS_IP_LIMIT, window=STAYS_WINDOW_SECONDS)
async def create_stay_booking(request: StaysBookingCreate):
    """Step 4 of 4: finalizes the booking from a quote_id. NOT persisted
    anywhere in our own DB - see this module's docstring. The response is
    Duffel's own booking record; there is currently no way to look this
    booking up again through this app after this call returns."""
    try:
        return await duffel_stay_service.create_booking(
            request.model_dump(mode="json", exclude_none=True)
        )
    except DuffelAPIError as e:
        raise _duffel_http_exception(e)
