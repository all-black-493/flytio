"""Airport/city search schemas (Duffel API v2's /places/suggestions) -
split out of duffel_flights.py: this is a distinct domain (geo/reference
data lookup, no offer/order concept involved at all), not part of the
shopping or booking flow.
"""

import enum

from pydantic import Field, model_validator

from backend.schemas.common import BaseSchema


class PlaceType(str, enum.Enum):
    AIRPORT = "airport"
    CITY = "city"


class PlaceSuggestionsQuery(BaseSchema):
    """Query params for GET /places/suggestions.

    Duffel's endpoint runs in exactly one of two modes: text autocomplete
    (`query`) or a geographic radius search (`lat`+`lng`+`rad`), never both.
    """

    query: str | None = Field(
        default=None, min_length=1, description="Free-text name or IATA code"
    )
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    rad: int | None = Field(default=None, ge=1, description="Radius in meters")

    @model_validator(mode="after")
    def _check_exactly_one_mode(self) -> "PlaceSuggestionsQuery":
        has_query = self.query is not None
        geo_fields = (self.lat, self.lng, self.rad)
        has_any_geo = any(f is not None for f in geo_fields)
        has_full_geo = all(f is not None for f in geo_fields)

        if not has_query and not has_any_geo:
            raise ValueError("Provide either `query` or `lat`+`lng`+`rad`")
        if has_query and has_any_geo:
            raise ValueError("Provide either `query` or `lat`+`lng`+`rad`, not both")
        if has_any_geo and not has_full_geo:
            raise ValueError("`lat`, `lng`, and `rad` must all be provided together")
        return self


class Place(BaseSchema):
    id: str
    type: PlaceType
    name: str
    iata_code: str | None = None
    iata_country_code: str | None = None
    iata_city_code: str | None = None
    icao_code: str | None = None
    city_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    time_zone: str | None = None
    airports: list["Place"] | None = Field(
        default=None, description="Present on city-type places"
    )


class PlaceSuggestionsResponse(BaseSchema):
    """Duffel envelope for a list of airport/city suggestions."""

    data: list[Place]
    meta: dict | None = None
