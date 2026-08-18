from backend.external_services.duffel_client import DuffelAPIError, DuffelService

# Re-exported: a dozen modules and tests import DuffelAPIError from here.
__all__ = ["DuffelAPIError", "duffel_flight_service"]


class DuffelFlightService(DuffelService):
    """Service for the Duffel Flights API (v2) over plain REST with httpx.

    Duffel's official Python SDK is archived and pinned to API v1, so per
    Duffel's guidance we call the documented REST endpoints directly:
    https://duffel.com/docs/api
    """

    async def search_flights(self, offer_request: dict) -> dict:
        """Create an offer request and return it with its offers included."""
        return await self._request(
            "POST",
            "/air/offer_requests",
            json_body={"data": offer_request},
            params={"return_offers": "true"},
        )

    async def confirm_price(self, offer_id: str) -> dict:
        """Fetch a single offer fresh from Duffel to confirm its live price.

        Duffel has no separate pricing endpoint: re-fetching the offer
        returns its up-to-date total_amount/total_currency.
        """
        return await self._request(
            "GET",
            f"/air/offers/{offer_id}",
            params={"return_available_services": "true"},
        )

    async def create_flight_order(self, order: dict) -> dict:
        """Book a selected offer with full passenger and payment details."""
        return await self._request("POST", "/air/orders", json_body={"data": order})

    async def view_seat_map(self, offer_id: str) -> dict:
        """Seat maps are looked up per offer (pre-booking) in Duffel."""
        return await self._request(
            "GET", "/air/seat_maps", params={"offer_id": offer_id}
        )

    async def get_flight_order(self, order_id: str) -> dict:
        """
        Retrieves flight order details from Duffel.

        Args: order_id (str): The ID of the order to retrieve (ord_...)

        Returns: dict: The order details, wrapped in Duffel's `data` envelope
        """
        return await self._request("GET", f"/air/orders/{order_id}")

    async def list_flight_orders(self, params: dict | None = None) -> dict:
        """
        Lists flight orders, optionally filtered/paginated.

        Args: params (dict | None): Query params such as booking_reference,
            awaiting_payment, origin, destination, sort, limit, after, before

        Returns: dict: A page of orders under `data`, with pagination `meta`
        """
        return await self._request("GET", "/air/orders", params=params)

    async def request_order_cancellation(self, order_id: str) -> dict:
        """
        Creates an unconfirmed cancellation quote for an order.

        The quote states the refund amount and an expiry; it must be
        confirmed via `confirm_order_cancellation` before it takes effect.
        """
        return await self._request(
            "POST",
            "/air/order_cancellations",
            json_body={"data": {"order_id": order_id}},
        )

    async def confirm_order_cancellation(self, order_cancellation_id: str) -> dict:
        """Confirms a previously created order cancellation quote, finalizing
        the cancellation and initiating the refund."""
        return await self._request(
            "POST",
            f"/air/order_cancellations/{order_cancellation_id}/actions/confirm",
        )

    async def update_offer_passenger(
        self, offer_id: str, offer_passenger_id: str, update: dict
    ) -> dict:
        """Attaches loyalty programme accounts (and re-confirms the
        passenger's name) to a specific passenger on an already-created
        offer - may reveal a loyalty-discounted fare, only reflected by
        re-fetching the offer afterward (see confirm_price)."""
        return await self._request(
            "PATCH",
            f"/air/offers/{offer_id}/passengers/{offer_passenger_id}",
            json_body={"data": update},
        )

    async def create_order_change_request(self, order_id: str, slices: dict) -> dict:
        """Step 1 of changing an order: describe which slice(s) to remove
        and what new slice(s) to search for in their place. Doesn't touch
        the order yet - returns candidate offers to review next."""
        return await self._request(
            "POST",
            "/air/order_change_requests",
            json_body={"data": {"order_id": order_id, "slices": slices}},
        )

    async def list_order_change_offers(self, order_change_request_id: str) -> dict:
        """Step 2: the priced ways to satisfy a change request."""
        return await self._request(
            "GET",
            "/air/order_change_offers",
            params={"order_change_request_id": order_change_request_id},
        )

    async def create_order_change(self, selected_order_change_offer: str) -> dict:
        """Step 3: creates a pending change from a chosen offer - not
        confirmed/charged yet."""
        return await self._request(
            "POST",
            "/air/order_changes",
            json_body={
                "data": {"selected_order_change_offer": selected_order_change_offer}
            },
        )

    async def confirm_order_change(self, order_change_id: str, payment: dict) -> dict:
        """Step 4: pays for and finalizes a pending order change."""
        return await self._request(
            "POST",
            f"/air/order_changes/{order_change_id}/confirm",
            json_body={"data": {"payment": payment}},
        )

    async def create_webhook(self, url: str, events: list[str]) -> dict:
        """Registers a webhook endpoint with Duffel - the returned `secret`
        is shown exactly once and must be saved as DUFFEL_WEBHOOK_SECRET;
        see backend/scripts/register_duffel_webhook.py, the one-off script
        that calls this."""
        return await self._request(
            "POST",
            "/air/webhooks",
            json_body={"data": {"url": url, "events": events}},
        )

    async def search_places(self, params: dict) -> dict:
        """Search airports and cities via Duffel's places suggestions
        endpoint, in either text-query or lat/lng/rad mode."""
        return await self._request("GET", "/places/suggestions", params=params)

    async def create_payment_intent(self, amount: str, currency: str) -> dict:
        """Starts a Duffel Payments card collection: returns a client_token
        the frontend uses with the DuffelPayments React component to
        collect card details directly with Duffel (card data never
        reaches our backend). Confirming it (below) tops up our Duffel
        Balance by this amount, minus Duffel's processing fee."""
        return await self._request(
            "POST",
            "/payments/payment_intents",
            json_body={"data": {"amount": amount, "currency": currency}},
        )

    async def confirm_payment_intent(self, payment_intent_id: str) -> dict:
        """Confirms a PaymentIntent once the frontend reports a successful
        card collection, finalizing the Balance top-up."""
        return await self._request(
            "POST", f"/payments/payment_intents/{payment_intent_id}/actions/confirm"
        )


duffel_flight_service = DuffelFlightService()
