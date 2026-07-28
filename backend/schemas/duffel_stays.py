"""Request schemas for the Duffel Stays API (v2) - foundation only, see
backend/routers/stays.py's module docstring. Field names follow Duffel's
snake_case wire format, same convention as duffel_flights.py.

Response bodies are deliberately NOT modeled here and are passed back to
the caller as raw dicts (see routers/stays.py) - Duffel's docs don't
publish the full Stays response object shapes the way they do for
Flights, so typing them here would mean guessing field names rather than
transcribing confirmed ones.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class StaysGeographicCoordinates(BaseSchema):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class StaysLocation(BaseSchema):
    radius: float = Field(gt=0, description="Search radius in km")
    geographic_coordinates: StaysGeographicCoordinates


class StaysGuest(BaseSchema):
    type: str = Field(default="adult", description="adult or child")
    age: int | None = Field(default=None, ge=0, le=130)


class StaysSearchRequest(BaseSchema):
    rooms: int = Field(ge=1)
    check_in_date: date
    check_out_date: date
    guests: list[StaysGuest] = Field(min_length=1)
    location: StaysLocation

    @model_validator(mode="after")
    def _validate_dates(self) -> "StaysSearchRequest":
        if self.check_out_date <= self.check_in_date:
            raise ValueError("check_out_date must be after check_in_date")
        return self


class StaysQuoteRequest(BaseSchema):
    rate_id: str = Field(description="A rate id (rat_...) from fetch_rates")


class StaysBookingGuest(BaseSchema):
    given_name: str
    family_name: str
    born_on: date


class StaysBookingCreate(BaseSchema):
    quote_id: str = Field(description="A quote id (stq_...) from create_quote")
    email: EmailStr
    phone_number: str = Field(description="E.164 format, e.g. +442080160508")
    guests: list[StaysBookingGuest] = Field(min_length=1)
    accommodation_special_requests: str | None = None
