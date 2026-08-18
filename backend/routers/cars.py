"""Duffel Cars (car hire) API - FOUNDATION ONLY.

Search -> quote -> booking, proxied straight through to Duffel
(external_services/car.py) with no local persistence: no Car/CarBooking
DB model, no ownership linking a booking to a flyt user, no confirmation
email, none of the CRUD layer routers/flights.py has. A car booked
through this API today exists in Duffel's system and not in ours.

That is deliberate, and it is the same scope routers/stays.py has. The
next step for both is not a Car table and a Stay table, but a single Trip
that owns heterogeneous components - a traveller buying a flight, a hotel
and a car as one package needs one thing to cancel, refund and remind
against, not three unrelated bookings that happen to share dates. Adding
per-product persistence now would be building the thing that has to be
replaced.

Unauthenticated, matching flights' shopping endpoints and stays. Booking
creation here should require auth the moment it persists anything, the
way POST /booking/flight-orders does.
"""

from typing import Annotated

from fastapi import APIRouter, Path, status

from backend.external_services.car import DuffelAPIError, duffel_car_service
from backend.schemas.duffel_cars import CarsBookingRequest, CarsSearchRequest
from backend.utils.duffel_errors import duffel_http_exception
from backend.utils.guard import guard_deco

router = APIRouter(prefix="/cars", tags=["Cars"])

# Matches the stays budget. Each call is a paid upstream request, and a
# search is the expensive one - the same reasoning as STAYS_IP_LIMIT.
CARS_IP_LIMIT = 20
CARS_WINDOW_SECONDS = 60


@router.post("/search")
@guard_deco.rate_limit(requests=CARS_IP_LIMIT, window=CARS_WINDOW_SECONDS)
async def search_cars(request: CarsSearchRequest):
    """Step 1 of 3: available vehicles for a pick-up location and period.

    Returns Duffel's raw search response - each result carries the
    quote id step 2 needs. Not modelled into a response schema on
    purpose (see schemas/duffel_cars.py): Duffel documents the request
    parameters but not the response shape, and a guessed model would
    silently drop fields callers need.
    """
    try:
        return await duffel_car_service.search_cars(request.to_duffel())
    except DuffelAPIError as e:
        raise duffel_http_exception(e)


@router.get("/quotes/{quote_id}")
@guard_deco.rate_limit(requests=CARS_IP_LIMIT, window=CARS_WINDOW_SECONDS)
async def get_car_quote(
    quote_id: Annotated[
        str, Path(min_length=1, description="quo_... from a search result")
    ],
):
    """Step 2 of 3: re-read a quote to confirm it is still valid and
    still priced as displayed.

    Worth doing rather than booking straight from a search result:
    availability and price move between the two, and finding out at
    booking time means telling a customer no after they have committed.
    """
    try:
        return await duffel_car_service.get_quote(quote_id)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
@guard_deco.rate_limit(requests=CARS_IP_LIMIT, window=CARS_WINDOW_SECONDS)
async def create_car_booking(request: CarsBookingRequest):
    """Step 3 of 3: reserve the vehicle against a quote.

    No payment object, unlike a flight order: a car reservation is
    settled at the desk against the renter's own licence and card. What
    this creates is the reservation - which is also why a package that
    includes a car cannot simply charge for it up front without deciding
    who carries the supplier relationship.
    """
    try:
        return await duffel_car_service.create_booking(request.to_duffel())
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
