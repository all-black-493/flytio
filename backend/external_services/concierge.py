"""Wraps OpenAI (via pydantic-ai) the same way external_services/flight.py
wraps Duffel and external_services/payment.py wraps Pesapal - the
third-party-API layer, kept out of routers/crud.

`concierge_agent` is None when OPENAI_API_KEY is unset (see config.py) -
routers/concierge.py checks this and returns 503 rather than the app
failing to start, or the agent failing confusingly mid-stream.
"""

from dataclasses import dataclass
from datetime import date

from pydantic import ValidationError
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlmodel import Session

from backend.config import settings
from backend.crud.bookings import get_booking_by_reference, mark_booking_cancelled
from backend.crud.db import engine
from backend.crud.flights import search_flights_cached
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.models.bookings import Booking, BookingStatus
from backend.models.users import UserInDB
from backend.schemas.concierge import (
    BookingSummary,
    CancellationQuote,
    ChangeOption,
    FlightCard,
)
from backend.schemas.duffel_flights import (
    FlightSearchQueryParams,
    Offer,
    OfferListQueryParams,
)
from backend.schemas.duffel_orders import (
    OrderCancellationQuote,
    OrderChangeOffersData,
    OrderChangeRequest,
    OrderChangeSliceAdd,
    OrderChangeSliceRemove,
    OrderChangeSlices,
)
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.kafka import kafka_producer
from backend.utils.offer_filtering import build_flight_search_response
from backend.utils.pricing import get_active_markup_rate

CONCIERGE_INSTRUCTIONS = """\
You are flyt's air travel concierge - not a general-purpose chatbot.
You help travelers find real, bookable flights on flyt. Stay strictly
on topic: flights, fares, routes, and travel planning for trips flyt can
actually book. If asked about anything else, politely explain you can
only help with flyt travel and redirect to that.

Always use the search_flights tool to find real flights - never invent
flight numbers, times, or prices. The tool's results are shown to the
traveler as their own visual cards, so keep your own reply short: a
sentence or two of context, not a restatement of every detail already
on the cards.

Reply in plain text only - no markdown (no **bold**, no #headers, no
bullet/numbered lists, no backticks). The chat UI renders your reply as
plain text, not markdown, so formatting characters would show up
literally instead of being styled.

You can also help a traveler manage a booking they already have, by its
reference code:
- get_my_booking to look up the details of one of their own bookings.
- get_cancellation_quote to see the refund for cancelling one - this
  does not cancel anything.
- confirm_cancellation to actually cancel it. This is irreversible and
  triggers a real refund - NEVER call it unless the traveler has
  explicitly said, in this conversation, after seeing the quote, that
  they want to go ahead. If there's any doubt, ask them to confirm
  first instead of calling this tool.
- search_change_options to see priced options for changing one leg of a
  booking to a different route or date - informational only, it cannot
  complete a change. If a traveler wants to go ahead with an option,
  tell them to finish it from their account page (Manage booking) or
  contact support, since completing a change needs a payment step this
  chat doesn't have.
"""


@dataclass
class ConciergeDeps:
    # None for a signed-out visitor. Flight search works for everyone; the
    # booking tools below need an account, and say so rather than failing.
    user: UserInDB | None


def _build_agent() -> Agent[ConciergeDeps, str] | None:
    """Explicit model + provider construction, not the Agent("openai:...")
    shorthand: that shorthand's OpenAIProvider reads the key from the
    OPENAI_API_KEY *process environment variable*, not from `settings` -
    pydantic-settings loads .env into this Settings object only, it never
    exports those values into os.environ, so the shorthand path found
    nothing even with a real key in .env. Passing api_key explicitly is
    the only way this app's single-source-of-truth settings convention
    (config.py's own docstring) actually reaches pydantic-ai."""
    if not settings.OPENAI_API_KEY:
        return None
    model = OpenAIResponsesModel(
        settings.CONCIERGE_MODEL,
        provider=OpenAIProvider(api_key=settings.OPENAI_API_KEY),
    )
    return Agent(model, deps_type=ConciergeDeps, instructions=CONCIERGE_INSTRUCTIONS)


concierge_agent: Agent[ConciergeDeps, str] | None = _build_agent()


def _offer_to_card(offer: Offer) -> FlightCard:
    slice_ = offer.slices[0]
    return FlightCard(
        offer_id=offer.id,
        origin_iata_code=slice_.origin.iata_code or "",
        origin_city_name=slice_.origin.city_name,
        destination_iata_code=slice_.destination.iata_code or "",
        destination_city_name=slice_.destination.city_name,
        departing_at=slice_.segments[0].departing_at,
        arriving_at=slice_.segments[-1].arriving_at,
        duration=slice_.duration,
        stops=len(slice_.segments) - 1,
        airline_name=offer.owner.name if offer.owner else None,
        airline_logo_url=offer.owner.logo_symbol_url if offer.owner else None,
        total_amount=offer.total_amount,
        total_currency=offer.total_currency,
    )


SIGN_IN_REQUIRED = (
    "That needs a signed-in account. Ask the traveler to sign in at "
    "/login, then try again - flight search works either way."
)


def _require_user(user: "UserInDB | None") -> UserInDB:
    """Every booking tool starts here.

    Raises ModelRetry rather than an exception the run would die on: the
    agent reads the message and tells the traveler to sign in, which is a
    useful answer. A crash would surface as "the concierge isn't
    available", which is both wrong and unhelpful.
    """
    if user is None:
        raise ModelRetry(SIGN_IN_REQUIRED)
    return user


def _get_owned_booking_or_retry(
    session: Session, booking_reference: str, user: UserInDB
) -> Booking:
    """Same 'don't reveal whether it exists vs. isn't yours' posture as
    routers/bookings.py's _get_owned_booking, but as a ModelRetry instead
    of a 404 - there's no HTTP layer here for the model to interpret a
    status code from.

    Every booking-touching tool below opens its own short-lived `Session`
    (via the module-level `engine`, same as scripts/*.py) rather than
    getting one from FastAPI's `Depends(get_session)` - a StreamingResponse's
    body (which is what actually runs these tools, well after
    routers/concierge.py's handler function has already returned) is
    consumed by Starlette after the route handler returns, which is
    exactly the kind of place a request-scoped dependency's lifetime gets
    murky. Owning the session directly here removes any doubt."""
    booking = get_booking_by_reference(session, booking_reference, user.id)
    if booking is None:
        raise ModelRetry(
            f"No booking found with reference {booking_reference!r} for this "
            "traveler. Ask them to double-check the reference code."
        )
    return booking


if concierge_agent is not None:

    @concierge_agent.tool
    async def search_flights(
        ctx: RunContext[ConciergeDeps],
        origin_iata_code: str,
        destination_iata_code: str,
        departure_date: date,
        return_date: date | None = None,
        adults: int = 1,
    ) -> list[FlightCard]:
        """Search real, live flights flyt can book between two airports.

        origin_iata_code/destination_iata_code are 3-letter IATA airport
        codes (e.g. NBO, DXB). departure_date must not be in the past.
        Omit return_date for a one-way search.
        """
        try:
            query = FlightSearchQueryParams(
                origin=origin_iata_code,
                destination=destination_iata_code,
                departure_date=departure_date,
                return_date=return_date,
                adults=adults,
            )
        except ValidationError as e:
            raise ModelRetry(f"Invalid search: {e}")

        try:
            raw = await search_flights_cached(query.to_offer_request())
        except (DuffelAPIError, ValueError) as e:
            raise ModelRetry(
                f"That search didn't return any usable results ({e}). "
                "Try different airports or dates."
            )

        with Session(engine) as session:
            markup_rate = get_active_markup_rate(session)
        result = build_flight_search_response(raw, OfferListQueryParams(), markup_rate)
        return [_offer_to_card(group.primary) for group in result.groups[:5]]

    @concierge_agent.tool
    async def get_my_booking(
        ctx: RunContext[ConciergeDeps], booking_reference: str
    ) -> BookingSummary:
        """Look up one of the traveler's own bookings by its reference code
        (e.g. ABC123)."""
        with Session(engine) as session:
            booking = _get_owned_booking_or_retry(
                session, booking_reference, _require_user(ctx.deps.user)
            )
            first_slice = booking.slices[0]
            return BookingSummary(
                booking_reference=booking.booking_reference,
                status=booking.status.value,
                origin_iata_code=first_slice.origin_iata_code,
                destination_iata_code=first_slice.destination_iata_code,
                departing_at=first_slice.flights[0].departing_at,
                total_amount=booking.total_amount,
                total_currency=booking.total_currency,
            )

    @concierge_agent.tool
    async def get_cancellation_quote(
        ctx: RunContext[ConciergeDeps], booking_reference: str
    ) -> CancellationQuote:
        """Get a refund quote for cancelling one of the traveler's own
        bookings. This does NOT cancel anything - always show the quote to
        the traveler and get their explicit go-ahead before ever calling
        confirm_cancellation."""
        with Session(engine) as session:
            booking = _get_owned_booking_or_retry(
                session, booking_reference, _require_user(ctx.deps.user)
            )
            if booking.status == BookingStatus.CANCELLED:
                raise ModelRetry(f"Booking {booking_reference} is already cancelled.")
            duffel_order_id = booking.duffel_order_id
        # Session closed before the network call - no DB connection held
        # idle for the duration of an external HTTP request.
        try:
            response = await duffel_flight_service.request_order_cancellation(
                duffel_order_id
            )
        except (DuffelAPIError, ValueError) as e:
            raise ModelRetry(f"Couldn't get a cancellation quote: {e}")
        quote = OrderCancellationQuote.model_validate(response["data"])
        return CancellationQuote(
            cancellation_id=quote.id,
            refund_amount=quote.refund_amount,
            refund_currency=quote.refund_currency,
            expires_at=quote.expires_at,
            confirmed=False,
        )

    @concierge_agent.tool
    async def confirm_cancellation(
        ctx: RunContext[ConciergeDeps], booking_reference: str, cancellation_id: str
    ) -> CancellationQuote:
        """Finalize a cancellation from a quote already shown to the
        traveler. NEVER call this unless the traveler has explicitly said,
        in this conversation, that they want to go ahead - this is
        irreversible and triggers a real refund."""
        with Session(engine) as session:
            booking = _get_owned_booking_or_retry(
                session, booking_reference, _require_user(ctx.deps.user)
            )
            if booking.status == BookingStatus.CANCELLED:
                raise ModelRetry(f"Booking {booking_reference} is already cancelled.")

        try:
            response = await duffel_flight_service.confirm_order_cancellation(
                cancellation_id
            )
        except (DuffelAPIError, ValueError) as e:
            raise ModelRetry(f"Couldn't confirm the cancellation: {e}")

        # Fresh session for the write: only mark our own record cancelled
        # once Duffel has actually confirmed it, and a booking fetched
        # before the (possibly slow) network call above is stale to write
        # through regardless.
        quote = OrderCancellationQuote.model_validate(response["data"])
        with Session(engine) as session:
            booking = _get_owned_booking_or_retry(
                session, booking_reference, _require_user(ctx.deps.user)
            )
            mark_booking_cancelled(session, booking)
            # Same event the REST cancellation path publishes
            # (routers/bookings.py) - without it, a booking cancelled
            # through the concierge would notify nobody and, more
            # importantly, never refund the customer.
            kafka_producer.publish_event(
                KafkaTopics.BOOKING_EVENTS,
                KafkaEventTypes.BOOKING_CANCELLED,
                {
                    "user_id": _require_user(ctx.deps.user).id,
                    "booking_id": booking.id,
                    "booking_reference": booking.booking_reference,
                    "duffel_refund_amount": quote.refund_amount,
                    "duffel_refund_currency": quote.refund_currency,
                },
            )
        return CancellationQuote(
            cancellation_id=quote.id,
            refund_amount=quote.refund_amount,
            refund_currency=quote.refund_currency,
            expires_at=quote.expires_at,
            confirmed=True,
        )

    @concierge_agent.tool
    async def search_change_options(
        ctx: RunContext[ConciergeDeps],
        booking_reference: str,
        current_slice_origin_iata_code: str,
        current_slice_destination_iata_code: str,
        new_origin_iata_code: str,
        new_destination_iata_code: str,
        new_departure_date: date,
    ) -> list[ChangeOption]:
        """Search priced options to change one leg of a booking to a
        different route or date. This is informational only - it does NOT
        change the booking. Completing a change needs a payment step this
        chat can't do; if the traveler wants to go ahead with an option,
        tell them to finish it from their account page (Manage booking) or
        contact support."""
        with Session(engine) as session:
            booking = _get_owned_booking_or_retry(
                session, booking_reference, _require_user(ctx.deps.user)
            )
            matching_slice = next(
                (
                    s
                    for s in booking.slices
                    if s.origin_iata_code == current_slice_origin_iata_code
                    and s.destination_iata_code == current_slice_destination_iata_code
                ),
                None,
            )
            if matching_slice is None:
                raise ModelRetry(
                    f"Booking {booking_reference} has no leg from "
                    f"{current_slice_origin_iata_code} to {current_slice_destination_iata_code}."
                )
            duffel_order_id = booking.duffel_order_id
            duffel_slice_id = matching_slice.duffel_slice_id

        slices_request = OrderChangeSlices(
            remove=[OrderChangeSliceRemove(slice_id=duffel_slice_id)],
            add=[
                OrderChangeSliceAdd(
                    origin=new_origin_iata_code,
                    destination=new_destination_iata_code,
                    departure_date=new_departure_date,
                )
            ],
        )
        try:
            request_response = await duffel_flight_service.create_order_change_request(
                duffel_order_id,
                slices_request.model_dump(mode="json", exclude_none=True),
            )
            change_request = OrderChangeRequest.model_validate(request_response["data"])
            offers_response = await duffel_flight_service.list_order_change_offers(
                change_request.id
            )
        except (DuffelAPIError, ValueError) as e:
            raise ModelRetry(f"Couldn't search change options: {e}")

        offers_data = OrderChangeOffersData.model_validate(offers_response["data"])
        return [
            ChangeOption(
                change_offer_id=o.id,
                change_total_amount=o.change_total_amount,
                change_total_currency=o.change_total_currency,
                penalty_total_amount=o.penalty_total_amount,
                penalty_total_currency=o.penalty_total_currency,
            )
            for o in offers_data.offers
        ]
