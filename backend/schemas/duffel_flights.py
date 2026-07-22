"""Duffel-native request/response schemas for the flights API (Duffel API v2).

Field names follow Duffel's snake_case wire format exactly, so no aliases
are needed. See https://duffel.com/docs/api for the source of truth.
"""

import enum
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CabinClass(str, enum.Enum):
    FIRST = "first"
    BUSINESS = "business"
    PREMIUM_ECONOMY = "premium_economy"
    ECONOMY = "economy"


class PassengerType(str, enum.Enum):
    ADULT = "adult"
    CHILD = "child"
    INFANT_WITHOUT_SEAT = "infant_without_seat"


class OrderSort(str, enum.Enum):
    CREATED_AT = "created_at"
    CREATED_AT_DESC = "-created_at"
    PAYMENT_REQUIRED_BY = "payment_required_by"
    PAYMENT_REQUIRED_BY_DESC = "-payment_required_by"


# Request models


class SlicePlan(BaseSchema):
    origin: str = Field(
        min_length=3, max_length=3, description="IATA code of the origin airport/city"
    )
    destination: str = Field(
        min_length=3,
        max_length=3,
        description="IATA code of the destination airport/city",
    )
    departure_date: date = Field(description="Departure date (YYYY-MM-DD)")


class SearchPassenger(BaseSchema):
    """A passenger in an offer request: give either a type or an exact age."""

    type: PassengerType | None = None
    age: int | None = Field(default=None, ge=0, le=130)


class OfferRequestCreate(BaseSchema):
    slices: list[SlicePlan] = Field(min_length=1)
    passengers: list[SearchPassenger] = Field(min_length=1)
    cabin_class: CabinClass | None = None
    max_connections: int | None = Field(default=None, ge=0, le=2)


class FlightSearchQueryParams(BaseSchema):
    """Query params for the GET search endpoint; translated into an
    OfferRequestCreate (slices + passengers) before calling Duffel."""

    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    departure_date: date
    return_date: date | None = None
    adults: int = Field(default=1, ge=1)
    children: int = Field(default=0, ge=0)
    infants: int = Field(default=0, ge=0)
    cabin_class: CabinClass | None = None
    max_connections: int | None = Field(default=None, ge=0, le=2)

    def to_offer_request(self) -> OfferRequestCreate:
        slices = [
            SlicePlan(
                origin=self.origin,
                destination=self.destination,
                departure_date=self.departure_date,
            )
        ]
        if self.return_date:
            slices.append(
                SlicePlan(
                    origin=self.destination,
                    destination=self.origin,
                    departure_date=self.return_date,
                )
            )
        passengers = (
            [SearchPassenger(type=PassengerType.ADULT)] * self.adults
            + [SearchPassenger(type=PassengerType.CHILD)] * self.children
            + [SearchPassenger(type=PassengerType.INFANT_WITHOUT_SEAT)] * self.infants
        )
        return OfferRequestCreate(
            slices=slices,
            passengers=passengers,
            cabin_class=self.cabin_class,
            max_connections=self.max_connections,
        )


class OfferPriceRequest(BaseSchema):
    """Identifies the offer whose live price should be confirmed."""

    offer_id: str = Field(description="Duffel offer ID (off_...)")


class OrderPassenger(BaseSchema):
    id: str = Field(description="Passenger ID issued by the offer request")
    title: str = Field(description="e.g. mr, ms, mrs, miss, dr")
    gender: str = Field(description="m or f, as required by airlines")
    given_name: str
    family_name: str
    born_on: date
    email: EmailStr
    phone_number: str = Field(description="E.164 format, e.g. +442080160508")
    infant_passenger_id: str | None = Field(
        default=None,
        description="For adults responsible for an infant: the infant's passenger ID",
    )


class OrderPayment(BaseSchema):
    type: str = Field(default="balance", description="balance or arc_bsp_cash")
    currency: str = Field(min_length=3, max_length=3)
    amount: str = Field(description="Must match the offer's total_amount")


class OrderCreate(BaseSchema):
    selected_offers: list[str] = Field(
        min_length=1, max_length=1, description="A single offer ID to book"
    )
    passengers: list[OrderPassenger] = Field(min_length=1)
    payments: list[OrderPayment] = Field(min_length=1)


# Response models


class Airport(BaseSchema):
    iata_code: str | None = None
    name: str | None = None
    city_name: str | None = None


class Carrier(BaseSchema):
    iata_code: str | None = None
    name: str | None = None


class Aircraft(BaseSchema):
    iata_code: str | None = None
    name: str | None = None


class OfferSegment(BaseSchema):
    id: str
    origin: Airport
    destination: Airport
    departing_at: datetime
    arriving_at: datetime
    duration: str | None = None
    marketing_carrier: Carrier | None = None
    marketing_carrier_flight_number: str | None = None
    operating_carrier: Carrier | None = None
    aircraft: Aircraft | None = None


class OfferSlice(BaseSchema):
    id: str
    origin: Airport
    destination: Airport
    duration: str | None = None
    segments: list[OfferSegment] = []


class OfferPassenger(BaseSchema):
    id: str
    type: PassengerType | None = None
    age: int | None = None


class Offer(BaseSchema):
    id: str
    live_mode: bool | None = None
    expires_at: datetime | None = None
    total_amount: str
    total_currency: str
    base_amount: str | None = None
    base_currency: str | None = None
    tax_amount: str | None = None
    tax_currency: str | None = None
    owner: Carrier | None = None
    slices: list[OfferSlice] = []
    passengers: list[OfferPassenger] = []


class OfferRequest(BaseSchema):
    id: str
    live_mode: bool | None = None
    created_at: datetime | None = None
    passengers: list[OfferPassenger] = []
    offers: list[Offer] = []


class FlightSearchResponse(BaseSchema):
    """Duffel envelope: the offer request (with its offers) under `data`."""

    data: OfferRequest


class OfferResponse(BaseSchema):
    """Duffel envelope for a single, freshly priced offer."""

    data: Offer


# Order management models


class OrderSegment(BaseSchema):
    id: str
    origin: Airport
    destination: Airport
    departing_at: datetime
    arriving_at: datetime
    duration: str | None = None
    marketing_carrier: Carrier | None = None
    marketing_carrier_flight_number: str | None = None
    operating_carrier: Carrier | None = None
    aircraft: Aircraft | None = None


class OrderSlice(BaseSchema):
    id: str
    origin: Airport
    destination: Airport
    duration: str | None = None
    segments: list[OrderSegment] = []


class OrderPassengerDetail(BaseSchema):
    id: str
    type: PassengerType | None = None
    title: str | None = None
    gender: str | None = None
    given_name: str | None = None
    family_name: str | None = None
    born_on: date | None = None
    email: str | None = None
    phone_number: str | None = None
    infant_passenger_id: str | None = None


class PaymentStatus(BaseSchema):
    awaiting_payment: bool | None = None
    payment_required_by: datetime | None = None
    price_guarantee_expires_at: datetime | None = None


class OrderConditionDetail(BaseSchema):
    allowed: bool | None = None
    penalty_amount: str | None = None
    penalty_currency: str | None = None


class OrderConditions(BaseSchema):
    refund_before_departure: OrderConditionDetail | None = None
    change_before_departure: OrderConditionDetail | None = None


class Order(BaseSchema):
    id: str
    booking_reference: str | None = None
    live_mode: bool | None = None
    created_at: datetime | None = None
    cancelled_at: datetime | None = None
    total_amount: str | None = None
    total_currency: str | None = None
    base_amount: str | None = None
    base_currency: str | None = None
    tax_amount: str | None = None
    tax_currency: str | None = None
    owner: Carrier | None = None
    slices: list[OrderSlice] = []
    passengers: list[OrderPassengerDetail] = []
    payment_status: PaymentStatus | None = None
    conditions: OrderConditions | None = None
    available_actions: list[str] = []


class OrderListQueryParams(BaseSchema):
    """Query params for listing orders; translated into Duffel's flat
    query-string filters before calling the API."""

    booking_reference: str | None = None
    awaiting_payment: bool | None = None
    origin: str | None = Field(default=None, min_length=3, max_length=3)
    destination: str | None = Field(default=None, min_length=3, max_length=3)
    sort: OrderSort | None = None
    limit: int | None = Field(default=None, ge=1, le=200)
    before: str | None = None
    after: str | None = None

    def to_duffel_params(self) -> dict:
        return self.model_dump(mode="json", exclude_none=True)


class OrderResponse(BaseSchema):
    """Duffel envelope for a single order."""

    data: Order


class ListMeta(BaseSchema):
    limit: int | None = None
    after: str | None = None
    before: str | None = None


class OrderListResponse(BaseSchema):
    """Duffel envelope for a paginated list of orders."""

    data: list[Order]
    meta: ListMeta | None = None


class OrderCancellationQuote(BaseSchema):
    id: str
    order_id: str | None = None
    refund_amount: str | None = None
    refund_currency: str | None = None
    refund_to: str | None = None
    expires_at: datetime | None = None
    confirmed_at: datetime | None = None


class OrderCancellationResponse(BaseSchema):
    """Duffel envelope for an order cancellation quote or its confirmation."""

    data: OrderCancellationQuote


# Places (airport/city) search models


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
