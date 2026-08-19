"""Uber Guest Rides - the airport pickup that rides along with a flight.

Deliberately shaped like external_services/duffel_client.py: a lazily
built httpx client, one `_request` that maps errors to a typed exception,
and product methods on top. Two things differ, and both come from the API
rather than from taste.

First, auth. Duffel takes a static token; Uber takes OAuth2 client
credentials and returns a token that expires, so this exchanges
credentials for one and refreshes it before it lapses.

Second, availability. Guest Rides is not self-serve - it needs an
approved Uber for Business organization - so `uber_ride_service` is None
until all three settings are present, exactly as concierge_agent is None
without an OpenAI key. Callers check for None rather than catching a
configuration error at request time.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from backend.config import settings
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

# Both estates are real and separate, and an app belongs to exactly one.
# auth.uber.com and login.uber.com resolve to the same address and behave
# identically, so the contradiction between Uber's endpoint block and its
# curl samples is cosmetic; the split that matters is sandbox vs not.
UBER_HOSTS: dict[str, tuple[str, str]] = {
    # environment: (api base, token endpoint)
    "sandbox": (
        "https://sandbox-api.uber.com",
        "https://sandbox-login.uber.com/oauth/v2/token",
    ),
    "production": ("https://api.uber.com", "https://login.uber.com/oauth/v2/token"),
}

UBER_API_BASE_URL, UBER_TOKEN_URL = UBER_HOSTS[settings.UBER_ENVIRONMENT]

# The only scope Guest Rides needs. Requesting more would be rejected for
# an organization not entitled to it.
UBER_SCOPE = "guests.trips"

# Refresh this many seconds before the token actually expires, so a
# request never starts with a token that lapses mid-flight.
TOKEN_REFRESH_MARGIN_SECONDS = 60

# What marks a product as able to hold a car until a tracked flight lands.
# A product without it is an ordinary reserved ride that will not wait.
FLIGHT_TRACKING_ADD_ON = "AIRPORT_PICKUP_WITH_FLIGHT_TRACKING"


class UberAPIError(Exception):
    """Raised when Uber returns an error response.

    Mirrors DuffelAPIError so utils can map either to an HTTP response
    without caring which provider failed."""

    def __init__(self, status_code: int, errors: list[dict]):
        self.status_code = status_code
        self.errors = errors
        messages = (
            "; ".join(
                e.get("message") or e.get("title") or e.get("code", "") for e in errors
            )
            or f"Uber API returned HTTP {status_code}"
        )
        super().__init__(messages)


class UberRideService:
    """Guest Rides: estimate a fare, book a trip for someone who is not an
    Uber user, and read its status back."""

    def __init__(self) -> None:
        self.client_id = settings.UBER_CLIENT_ID
        self.client_secret = settings.UBER_CLIENT_SECRET
        self.organization_uuid = settings.UBER_ORGANIZATION_UUID
        self._client: httpx.AsyncClient | None = None
        self._access_token: str | None = None
        # Monotonic, not wall clock: a clock adjustment must not make a
        # live token look expired or an expired one look live.
        self._token_expires_at: float = 0.0

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=UBER_API_BASE_URL,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    # Identifies the organization the trip is billed to.
                    # Third-party applications are rejected without it.
                    "x-uber-organizationuuid": self.organization_uuid,
                },
                timeout=httpx.Timeout(30.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _token(self) -> str:
        """A valid bearer token, exchanged once and reused until it is
        close to expiring."""
        if self._access_token and time.monotonic() < self._token_expires_at:
            return self._access_token

        # A separate client: the token endpoint is on login.uber.com, not
        # api.uber.com, and takes form encoding rather than JSON.
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as token_client:
            response = await token_client.post(
                UBER_TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                    "scope": UBER_SCOPE,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if response.is_error:
            # Never log the body: a token response carries the token, and
            # an error body can echo the client_secret back.
            raise UberAPIError(
                response.status_code,
                [{"message": "Could not obtain an Uber access token"}],
            )

        payload = response.json()
        self._access_token = payload["access_token"]
        self._token_expires_at = (
            time.monotonic()
            + payload.get("expires_in", 0)
            - TOKEN_REFRESH_MARGIN_SECONDS
        )
        return self._access_token

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict | None = None,
        params: dict | None = None,
    ) -> dict:
        token = await self._token()
        response = await self.client.request(
            method,
            path,
            json=json_body,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

        if response.is_error:
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            # Uber is not consistent about the envelope: some errors are
            # {"errors": [...]}, others a bare {"message"/"code"}.
            errors = payload.get("errors")
            if not errors:
                errors = [payload] if payload else []
            raise UberAPIError(response.status_code, errors)

        # 204 on some management calls; .json() would raise on an empty body.
        if not response.content:
            return {}
        return response.json()

    async def estimate_airport_pickup(
        self,
        *,
        pickup: dict[str, Any],
        dropoff: dict[str, Any],
        pickup_time_ms: int,
        flight: dict[str, Any],
    ) -> dict:
        """Products and fares for a pickup that waits for a tracked flight.

        `flight` is what buys the waiting: without it Uber has nothing to
        track, and the products it returns carry no
        AIRPORT_PICKUP_WITH_FLIGHT_TRACKING add-on to select.
        """
        return await self._request(
            "POST",
            "/v1/guests/trips/estimates",
            json_body={
                "pickup": pickup,
                "dropoff": dropoff,
                "scheduling": {"pickup_time": pickup_time_ms},
                "flight": flight,
            },
        )

    async def create_guest_trip(self, payload: dict) -> dict:
        """Book the ride. `payload` should carry the fare_id from a recent
        estimate - without it the fare is whatever it is at booking time,
        which is not what the customer was charged."""
        return await self._request("POST", "/v1/guests/trips", json_body=payload)

    async def get_trip(self, request_id: str) -> dict:
        return await self._request("GET", f"/v1/guests/trips/{request_id}")

    async def cancel_guest_trip(self, request_id: str) -> dict:
        """Release a reserved ride.

        This is what makes the ride safe to book BEFORE the flight. A
        reserve product carries freeCancellationThresholdMinutes - sixty,
        typically - measured from pickup time, and an airport pickup is
        reserved for a landing hours or days away. Cancelling seconds
        after booking therefore falls far outside the window and costs
        nothing, so an unbookable flight can unwind the ride for free
        rather than leaving the customer holding half a trip.
        """
        return await self._request("DELETE", f"/v1/guests/trips/{request_id}")


def _build_service() -> UberRideService | None:
    """None unless every credential is present.

    All three or nothing: a client id with no organization uuid produces
    trips Uber rejects at request time, which is a worse failure than the
    feature being visibly absent.
    """
    missing = [
        name
        for name, value in (
            ("UBER_CLIENT_ID", settings.UBER_CLIENT_ID),
            ("UBER_CLIENT_SECRET", settings.UBER_CLIENT_SECRET),
            ("UBER_ORGANIZATION_UUID", settings.UBER_ORGANIZATION_UUID),
        )
        if not value
    ]
    if missing:
        logger.info(
            "Uber Guest Rides disabled, missing: %s - airport pickup will not "
            "be offered at checkout",
            ", ".join(missing),
        )
        return None

    return UberRideService()


uber_ride_service: UberRideService | None = _build_service()
