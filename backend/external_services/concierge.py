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

from backend.config import settings
from backend.crud.flights import search_flights_cached
from backend.external_services.flight import DuffelAPIError
from backend.models.users import UserInDB
from backend.schemas.concierge import FlightCard
from backend.schemas.duffel_flights import (
    FlightSearchQueryParams,
    Offer,
    OfferListQueryParams,
)
from backend.utils.offer_filtering import build_flight_search_response

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
"""


@dataclass
class ConciergeDeps:
    user: UserInDB


concierge_agent: Agent[ConciergeDeps, str] | None = (
    Agent(
        settings.CONCIERGE_MODEL,
        deps_type=ConciergeDeps,
        instructions=CONCIERGE_INSTRUCTIONS,
    )
    if settings.OPENAI_API_KEY
    else None
)


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

        result = build_flight_search_response(raw, OfferListQueryParams())
        return [_offer_to_card(group.primary) for group in result.groups[:5]]
