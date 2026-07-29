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
