from backend.external_services.duffel_client import DuffelAPIError, DuffelService

# Re-exported: routers/stays.py and tests import DuffelAPIError from here,
# and it is now the one shared class rather than a per-product copy.
__all__ = ["DuffelAPIError", "DuffelStayService", "duffel_stay_service"]


class DuffelStayService(DuffelService):
    """Service for the Duffel Stays API (v2) - foundation only. Search,
    rates, quotes, and booking creation, proxied through to Duffel
    directly with no local persistence (no Stay/StayBooking DB model
    exists yet - see backend/routers/stays.py's module docstring for
    scope). Mirrors DuffelFlightService's plain-REST-over-httpx approach
    for the same reason: Duffel's official Python SDK is archived and
    pinned to API v1.

    The exact request/response shapes below follow Duffel's documented
    JS SDK method signatures (stays.search / stays.quotes.create /
    stays.bookings.create) and its established REST convention of
    POST {resource} with a {"data": ...} envelope, consistent with every
    other Duffel endpoint this app calls - but Duffel's docs don't
    publish raw curl examples for the quote/booking endpoints specifically,
    so treat this as unverified against a live sandbox until exercised.
    """

    async def search_stays(self, search: dict) -> dict:
        """Location-based accommodation search - step 1 of 4."""
        return await self._request("POST", "/stays/search", json_body={"data": search})

    async def fetch_rates(self, search_result_id: str) -> dict:
        """Retrieves the full list of bookable room rates for one
        accommodation from a search result - step 2 of 4."""
        return await self._request(
            "POST", f"/stays/search_results/{search_result_id}/fetch_rates"
        )

    async def create_quote(self, rate_id: str) -> dict:
        """Re-validates a rate is still purchasable and locks its price
        for booking - step 3 of 4."""
        return await self._request(
            "POST", "/stays/quotes", json_body={"data": {"rate_id": rate_id}}
        )

    async def create_booking(self, booking: dict) -> dict:
        """Finalizes the booking from a quote_id - step 4 of 4."""
        return await self._request(
            "POST", "/stays/bookings", json_body={"data": booking}
        )


duffel_stay_service = DuffelStayService()
