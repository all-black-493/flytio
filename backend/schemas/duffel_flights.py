"""Duffel-native request/response schemas for the flights API (Duffel API v2).

Field names follow Duffel's snake_case wire format exactly, so no aliases
are needed. See https://duffel.com/docs/api for the source of truth.
"""

import enum
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from backend.schemas.common import PaginationMeta


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


class OfferSortKey(str, enum.Enum):
    PRICE = "price"
    DURATION = "duration"
    DEPARTURE = "departure"
    ARRIVAL = "arrival"


class OfferListQueryParams(BaseSchema):
    """Filter/sort/pagination params applied to an already-fetched (and
    Redis-cached) offer list - a view-layer concern, separate from the
    shopping request itself, so these don't affect the search cache key."""

    sort: OfferSortKey = OfferSortKey.PRICE
    airlines: list[str] = Field(
        default_factory=list, description="Owner IATA codes to keep"
    )
    max_stops: int | None = Field(default=None, ge=0)
    price_max: float | None = Field(default=None, ge=0)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class FlightSearchAndListQueryParams(FlightSearchQueryParams, OfferListQueryParams):
    """FastAPI only flattens one Query()-annotated Pydantic model's fields
    per path operation - two sibling Query() models on the same route don't
    both get flattened. search_flights_2 (GET) needs both sets of fields at
    once, so they're combined here via plain multiple inheritance (no
    overlapping field names between the two parents)."""


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
    seat_designator: str | None = Field(
        default=None,
        description=(
            "Seat picked in our own seat-map UI (e.g. '14C'), stored on our "
            "booking record. NOT sent to Duffel - reserving the seat with "
            "the airline requires attaching a paid seat service to the "
            "order, which isn't wired up yet."
        ),
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
    logo_symbol_url: str | None = None


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
    """Offer-request metadata only - the offers themselves are paginated
    separately, under `groups` on FlightSearchResponse."""

    id: str
    live_mode: bool | None = None
    created_at: datetime | None = None
    passengers: list[OfferPassenger] = []


class OfferGroup(BaseSchema):
    """Offers that share an itinerary (same origin/destination per slice)
    collapsed into one card: the cheapest as `primary`, the rest browsable
    as `alternates` (see backend/utils/offer_filtering.py:group_by_route)."""

    primary: Offer
    alternates: list[Offer] = []


class AirlineFacet(BaseSchema):
    code: str
    name: str
    count: int


class OfferFacets(BaseSchema):
    """Always computed from the full, unfiltered offer list for this
    search, regardless of which filters/page were requested - so facet
    counts stay stable as the user pages through or narrows results."""

    airlines: list[AirlineFacet]
    price_min: float
    price_max: float
    has_direct: bool
    has_one_stop: bool
    has_multi_stop: bool


class FlightSearchResponse(BaseSchema):
    """The offer request (metadata only) under `data`, the current page of
    grouped offers under `groups`, pagination info under `meta`, and
    facets (computed pre-filter, pre-pagination) under `facets`."""

    data: OfferRequest
    groups: list[OfferGroup]
    meta: PaginationMeta
    facets: OfferFacets


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


class OrderDocument(BaseSchema):
    """An issued travel document (e-ticket, or an EMD for a service), only
    present once an order has actually been paid for."""

    unique_identifier: str
    type: str = Field(description="e.g. electronic_ticket")
    passenger_ids: list[str] = []


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
    documents: list[OrderDocument] = []
    available_actions: list[str] = []


class OrderResponse(BaseSchema):
    """Duffel envelope for a single order."""

    data: Order


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
