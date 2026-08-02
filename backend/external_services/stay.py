import httpx

from backend.config import settings

DUFFEL_BASE_URL = "https://api.duffel.com"
DUFFEL_API_VERSION = "v2"


class DuffelAPIError(Exception):
    """Raised when the Duffel API returns an error response. Mirrors
    external_services/flight.py's DuffelAPIError - kept as a separate
    class (not imported from there) so this module has no dependency on
    the Flights service, matching one-service-per-Duffel-product-surface."""

    def __init__(self, status_code: int, errors: list[dict]):
        self.status_code = status_code
        self.errors = errors
        messages = (
            "; ".join(e.get("message") or e.get("title", "") for e in errors)
            or f"Duffel API returned HTTP {status_code}"
        )
        super().__init__(messages)


class DuffelStayService:
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

    def __init__(self):
        self.api_token = settings.DUFFEL_API_TOKEN
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            if not self.api_token:
                raise ValueError(
                    "Duffel API token not configured (set DUFFEL_API_TOKEN)"
                )
            self._client = httpx.AsyncClient(
                base_url=DUFFEL_BASE_URL,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Duffel-Version": DUFFEL_API_VERSION,
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                },
                timeout=httpx.Timeout(30.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict | None = None,
        params: dict | None = None,
    ) -> dict:
        response = await self.client.request(
            method, path, json=json_body, params=params
        )
        if response.is_error:
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            raise DuffelAPIError(response.status_code, payload.get("errors", []))
        return response.json()

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
