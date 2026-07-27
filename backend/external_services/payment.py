import httpx

from backend.config import settings
from backend.external_services.cache import redis_cache
from backend.schemas.pesapal import (
    PesapalAuthResponse,
    PesapalBillingAddress,
    PesapalRegisteredIpn,
    PesapalRegisterIpnResponse,
    PesapalSubmitOrderResponse,
    PesapalTransactionStatusResponse,
)

# Trailing slash matters: httpx resolves a base_url + a path starting with
# "/" as an *absolute* path on the same origin, which would silently drop
# the "/pesapalv3/api" (or "/v3/api") segment. Paths passed to _request()
# below are relative (no leading "/") so they merge onto this correctly.
PESAPAL_BASE_URLS = {
    "sandbox": "https://cybqa.pesapal.com/pesapalv3/api/",
    "live": "https://pay.pesapal.com/v3/api/",
}

TOKEN_CACHE_KEY = "pesapal:auth_token"
# Tokens are valid for 5 minutes; cache for less than that so a request
# never gets handed a token that expires mid-flight.
TOKEN_CACHE_TTL_SECONDS = 240


class PesapalAPIError(Exception):
    """Raised when the Pesapal API returns an HTTP error, or a non-null
    `error` field in an otherwise-200 response envelope."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class PesapalPaymentService:
    """Service for the Pesapal API v3.0 (JSON) over plain REST with httpx.
    See https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json
    """

    def __init__(self):
        self.consumer_key = settings.PESAPAL_CONSUMER_KEY
        self.consumer_secret = settings.PESAPAL_CONSUMER_SECRET
        self.ipn_id = settings.PESAPAL_IPN_ID
        self.base_url = PESAPAL_BASE_URLS.get(
            settings.PESAPAL_ENV, PESAPAL_BASE_URLS["live"]
        )
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        # Created lazily so the app (and tests) can import this module
        # before Pesapal credentials are configured.
        if self._client is None:
            if not self.consumer_key or not self.consumer_secret:
                raise ValueError(
                    "Pesapal credentials not configured (set "
                    "PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET)"
                )
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
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
        authenticated: bool = True,
    ) -> dict | list:
        headers = {}
        if authenticated:
            headers["Authorization"] = f"Bearer {await self._get_token()}"
        response = await self.client.request(
            method, path, json=json_body, params=params, headers=headers
        )
        if response.is_error:
            raise PesapalAPIError(response.status_code, response.text)
        payload = response.json()
        # Most endpoints return an object with a nullable `error` field;
        # GetIpnList is the one exception, returning a bare array - it has
        # no top-level `error` to check (a per-item `error` would apply if
        # Pesapal ever returned one, but the docs don't show that shape).
        #
        # Confirmed against a real transaction: a clean 200 response can
        # still carry `"error": {"error_type": null, "code": null,
        # "message": null}` - a non-empty dict that's truthy in Python even
        # though every field is null. Checking truthiness of the dict alone
        # (the previous approach) misclassified this as an error and threw
        # away a perfectly valid FAILED status_code. Only raise when the
        # error dict actually carries a non-null value.
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict) and any(error.values()):
            raise PesapalAPIError(response.status_code, str(error))
        return payload

    async def _get_token(self) -> str:
        cached = redis_cache.get(TOKEN_CACHE_KEY)
        if cached:
            return cached
        payload = await self._request(
            "POST",
            "Auth/RequestToken",
            json_body={
                "consumer_key": self.consumer_key,
                "consumer_secret": self.consumer_secret,
            },
            authenticated=False,
        )
        auth = PesapalAuthResponse.model_validate(payload)
        redis_cache.set(TOKEN_CACHE_KEY, auth.token, TOKEN_CACHE_TTL_SECONDS)
        return auth.token

    async def register_ipn(
        self, url: str, notification_type: str = "POST"
    ) -> PesapalRegisterIpnResponse:
        """One-off setup call - see backend/scripts/register_pesapal_ipn.py.
        Not called at request time once PESAPAL_IPN_ID is configured. Each
        call registers a *new* ipn_id even for a URL already registered -
        see get_registered_ipns() to check for an existing one first."""
        payload = await self._request(
            "POST",
            "URLSetup/RegisterIPN",
            json_body={"url": url, "ipn_notification_type": notification_type},
        )
        return PesapalRegisterIpnResponse.model_validate(payload)

    async def get_registered_ipns(self) -> list[PesapalRegisteredIpn]:
        """Lists every IPN URL registered on this merchant account. Unlike
        every other endpoint here, Pesapal returns a bare JSON array, not
        an object with a `data` envelope."""
        payload = await self._request("GET", "URLSetup/GetIpnList")
        return [PesapalRegisteredIpn.model_validate(item) for item in payload]

    async def submit_order_request(
        self,
        *,
        merchant_reference: str,
        amount: float,
        currency: str,
        description: str,
        callback_url: str,
        billing_address: PesapalBillingAddress,
        cancellation_url: str | None = None,
    ) -> PesapalSubmitOrderResponse:
        if not self.ipn_id:
            raise ValueError("Pesapal IPN not registered")
        body = {
            "id": merchant_reference,
            "currency": currency,
            "amount": amount,
            "description": description,
            "callback_url": callback_url,
            "notification_id": self.ipn_id,
            "billing_address": billing_address.model_dump(exclude_none=True),
        }
        if cancellation_url:
            body["cancellation_url"] = cancellation_url
        payload = await self._request(
            "POST", "Transactions/SubmitOrderRequest", json_body=body
        )
        return PesapalSubmitOrderResponse.model_validate(payload)

    async def get_transaction_status(
        self, order_tracking_id: str
    ) -> PesapalTransactionStatusResponse:
        payload = await self._request(
            "GET",
            "Transactions/GetTransactionStatus",
            params={"orderTrackingId": order_tracking_id},
        )
        return PesapalTransactionStatusResponse.model_validate(payload)


pesapal_payment_service = PesapalPaymentService()
