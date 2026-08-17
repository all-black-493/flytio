"""Duffel Cars - car hire, the third product surface.

Transport, auth and error handling come from DuffelService
(external_services/duffel_client.py); this module owns only what is
specific to cars: three endpoints and their semantics.

Scope, stated plainly: a pass-through, with no local persistence. There
is no Car/CarBooking model, exactly as Stays has none - see
routers/cars.py. That is a deliberate first step, not an oversight: the
multi-product package plan needs a Trip parent that owns heterogeneous
components, and inventing a car-shaped table now would be a table to
migrate later.

The REST paths below follow Duffel's documented SDK methods
(cars.search, cars.quotes.get, cars.bookings.create) and its uniform
convention of `{"data": ...}` envelopes on POST - the same convention
every other Duffel endpoint this app calls uses. Duffel publishes the
request parameters for Cars but not raw curl examples, so treat the exact
paths as unverified against a live sandbox until exercised. That is the
same caveat stay.py carries, and for the same reason.
"""

from backend.external_services.duffel_client import DuffelAPIError, DuffelService

__all__ = ["DuffelAPIError", "DuffelCarService", "duffel_car_service"]


class DuffelCarService(DuffelService):
    """Search, quote and book car hire.

    Three steps, not four: unlike Stays there is no separate rate-fetch,
    because a car search already returns quotable rates. The quote step
    is a GET rather than a POST for the same reason - the quote already
    exists, and this re-reads it to confirm it is still valid and priced
    as shown before a booking is attempted.
    """

    async def search_cars(self, search: dict) -> dict:
        """Available vehicles for a location and period - step 1 of 3."""
        return await self._request("POST", "/cars/search", json_body={"data": search})

    async def get_quote(self, quote_id: str) -> dict:
        """Re-read one quote before booking it - step 2 of 3.

        Prices and availability move between search and checkout, and a
        stale quote fails at booking time with the customer already
        committed. Reading it first turns that into a re-quote."""
        return await self._request("GET", f"/cars/quotes/{quote_id}")

    async def create_booking(self, booking: dict) -> dict:
        """Reserve the vehicle against a quote - step 3 of 3."""
        return await self._request(
            "POST", "/cars/bookings", json_body={"data": booking}
        )


duffel_car_service = DuffelCarService()
