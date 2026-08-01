"""Wire/tool-output shape for the air travel concierge
(external_services/concierge.py) - nothing here is persisted, this is
purely what the search_flights tool hands back to the model (and, via
pydantic_ai.ui.vercel_ai, straight through to the browser as a
renderable card). Plain BaseModel, not SQLModel, same precedent as
schemas/rbac.py for non-persisted API-only shapes.
"""

from datetime import datetime

from pydantic import BaseModel


class FlightCard(BaseModel):
    offer_id: str
    origin_iata_code: str
    origin_city_name: str | None = None
    destination_iata_code: str
    destination_city_name: str | None = None
    departing_at: datetime
    arriving_at: datetime
    duration: str | None = None
    stops: int
    airline_name: str | None = None
    airline_logo_url: str | None = None
    total_amount: str
    total_currency: str


class BookingSummary(BaseModel):
    """Output of get_my_booking - just enough for the model to talk about
    a booking without ever seeing the full persisted record (passenger
    documents, ticket numbers, etc.)."""

    booking_reference: str
    status: str
    origin_iata_code: str
    destination_iata_code: str
    departing_at: datetime
    total_amount: str
    total_currency: str


class CancellationQuote(BaseModel):
    """Output of both get_cancellation_quote (confirmed=False) and
    confirm_cancellation (confirmed=True) - same shape, since confirming
    doesn't change what a traveler needs to see, just whether it's done."""

    cancellation_id: str
    refund_amount: str | None = None
    refund_currency: str | None = None
    expires_at: datetime | None = None
    confirmed: bool


class ChangeOption(BaseModel):
    """One priced way to satisfy a requested slice change - informational
    only. Completing a change needs a payment step this chat doesn't
    have (see external_services/concierge.py's search_change_options
    docstring for why the concierge stops here)."""

    change_offer_id: str
    change_total_amount: str | None = None
    change_total_currency: str | None = None
    penalty_total_amount: str | None = None
    penalty_total_currency: str | None = None
