"""The HTTP plumbing every Duffel product surface shares.

Duffel exposes flights, accommodation and car hire as three separate
product APIs, and this app wraps each in its own service module. What
they genuinely share is the transport: same host, same auth header, same
API version, same `{"data": ...}` envelope, same error envelope. That was
copied verbatim into flight.py and stay.py, and cars would have made a
third identical copy - so it lives here once.

What is NOT shared is anything product-specific. Each service still owns
its own paths, request shapes and semantics, because those have nothing
in common beyond the wire.

One DuffelAPIError, not one per product. flight.py and stay.py each used
to define their own, which meant `except DuffelAPIError` only caught
errors from the module you happened to import it from - fine while every
call site used one product, and a trap the moment a package flow touches
two. Both modules re-export this one, so every existing import keeps
working and now refers to the same class.
"""

import httpx

from backend.config import settings

DUFFEL_BASE_URL = "https://api.duffel.com"
DUFFEL_API_VERSION = "v2"


class DuffelAPIError(Exception):
    """Raised when the Duffel API returns an error response.

    Carries the status code and Duffel's own error list so callers can
    map it to an HTTP response (utils/duffel_errors.py) rather than
    guessing from a string."""

    def __init__(self, status_code: int, errors: list[dict]):
        self.status_code = status_code
        self.errors = errors
        messages = (
            "; ".join(e.get("message") or e.get("title", "") for e in errors)
            or f"Duffel API returned HTTP {status_code}"
        )
        super().__init__(messages)


class DuffelService:
    """Base for a Duffel product service. Subclasses add methods; none of
    them re-implement the client, the auth header or the error mapping."""

    def __init__(self) -> None:
        self.api_token = settings.DUFFEL_API_TOKEN
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        # Created lazily so the app (and tests) can import any service
        # module before DUFFEL_API_TOKEN is configured.
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
