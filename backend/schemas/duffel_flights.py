"""Duffel-native request/response schemas for the FLIGHTS/OFFERS side of
the flights API (Duffel API v2) - searching and pricing. Order creation/
management schemas live in schemas/duffel_orders.py; airport/city search
lives in schemas/duffel_places.py - see those modules' docstrings for why
they're split out.

Field names follow Duffel's snake_case wire format exactly, so no aliases
are needed. See https://duffel.com/docs/api for the source of truth.
"""

import enum
from datetime import date, datetime

from pydantic import Field, field_validator, model_validator

from backend.schemas.common import BaseSchema, PaginationMeta, not_in_past


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

    _validate_departure_date = field_validator("departure_date")(not_in_past)


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

    _validate_departure_date = field_validator("departure_date")(not_in_past)

    @model_validator(mode="after")
    def _validate_return_after_departure(self) -> "FlightSearchQueryParams":
        if self.return_date is not None and self.return_date < self.departure_date:
            raise ValueError("return_date cannot be before departure_date")
        return self

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
    # Balances price against how long you're travelling and how many times
    # you change planes - the cheapest fare is frequently a 20-hour
    # two-stop itinerary, which is not what most people mean by "best".
    BEST = "best"
    PRICE = "price"
    DURATION = "duration"
    DEPARTURE = "departure"
    ARRIVAL = "arrival"


class DepartureWindow(str, enum.Enum):
    """Local departure time of the outbound leg. Travellers shop by "I
    want to leave in the morning" far more often than by an exact time,
    and it's the filter airline sites lead with."""

    MORNING = "morning"  # 05:00-11:59
    AFTERNOON = "afternoon"  # 12:00-17:59
    EVENING = "evening"  # 18:00-21:59
    NIGHT = "night"  # 22:00-04:59


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
    depart_windows: list[DepartureWindow] = Field(
        default_factory=list,
        description="Keep offers whose outbound leg departs in any of these windows",
    )
    max_duration_minutes: int | None = Field(default=None, ge=0)
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


class LoyaltyProgrammeAccount(BaseSchema):
    """A frequent-flyer account to attach to an already-priced offer via
    PATCH /air/offers/{offer_id}/passengers/{offer_passenger_id} (see
    routers/flights.py's update_offer_passenger) - may reveal a
    loyalty-discounted fare, reflected by re-fetching the offer
    afterward. Not sent again at order-creation time; Duffel carries it
    through automatically from the offer it was attached to."""

    airline_iata_code: str = Field(min_length=2, max_length=2)
    account_number: str


class OfferPassengerUpdate(BaseSchema):
    """Request body for attaching loyalty programme accounts to a
    specific passenger on an already-created offer. Duffel requires the
    passenger's name alongside the loyalty details."""

    given_name: str
    family_name: str
    loyalty_programme_accounts: list[LoyaltyProgrammeAccount] = Field(min_length=1)


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


class Baggage(BaseSchema):
    type: str = Field(description="e.g. checked or carry_on")
    quantity: int


class ConditionDetail(BaseSchema):
    """Shared shape for every refund/change condition Duffel returns - on
    an offer (pre-purchase), a slice, or an order (post-purchase); see
    Offer.conditions/OfferSlice.conditions/Order.conditions below. `None`
    means Duffel doesn't support/report conditions for that airline/offer,
    not that the traveler doesn't have that right."""

    allowed: bool | None = None
    penalty_amount: str | None = None
    penalty_currency: str | None = None


class Conditions(BaseSchema):
    refund_before_departure: ConditionDetail | None = None
    change_before_departure: ConditionDetail | None = None


class OfferSliceConditions(BaseSchema):
    """Richer than the offer/order-level Conditions - per-slice perks
    beyond just refund/change, e.g. whether this specific fare includes
    priority boarding."""

    change_before_departure: ConditionDetail | None = None
    priority_check_in: bool | None = None
    priority_boarding: bool | None = None
    advance_seat_selection: bool | None = None


class PaymentRequirements(BaseSchema):
    """Whether an offer must be paid immediately or can be held (see
    Duffel's holding-orders-and-paying-later guide) - we always pay
    instantly today (see crud/payments.py's _complete_booking), so this is
    surfaced but not yet acted on; an offer with requires_instant_payment
    False would still work, just without using the hold option."""

    requires_instant_payment: bool | None = None
    price_guarantee_expires_at: datetime | None = None
    payment_required_by: datetime | None = None


class CabinAmenitySeat(BaseSchema):
    pitch: str | None = None
    legroom: str | None = None
    type: str | None = None


class CabinAmenityWifi(BaseSchema):
    available: bool | None = None
    cost: str | None = None


class CabinAmenityPower(BaseSchema):
    available: bool | None = None


class CabinAmenities(BaseSchema):
    seat: CabinAmenitySeat | None = None
    wifi: CabinAmenityWifi | None = None
    power: CabinAmenityPower | None = None


class Cabin(BaseSchema):
    name: str | None = None
    marketing_name: str | None = None
    amenities: CabinAmenities | None = None


class OfferSegmentPassenger(BaseSchema):
    """Per-passenger details for one segment - baggages is the allowance
    *included* in the fare (purchasable extra baggage is a separate
    Duffel `available_services` ancillary-purchase flow, not modeled
    here). cabin_class/cabin_class_marketing_name/fare_basis_code answer
    "what am I actually getting" more precisely than the offer-request's
    own cabin_class - e.g. a request for "economy" can be granted as the
    airline's "Basic Economy" on some segments and not others. `cabin` is
    the richer, nested version of the same info (seat pitch, wifi, power)."""

    passenger_id: str
    baggages: list[Baggage] = []
    cabin: Cabin | None = None
    cabin_class: str | None = None
    cabin_class_marketing_name: str | None = None
    fare_basis_code: str | None = None


class OfferSegment(BaseSchema):
    id: str
    origin: Airport
    destination: Airport
    origin_terminal: str | int | None = None
    destination_terminal: str | int | None = None
    departing_at: datetime
    arriving_at: datetime
    duration: str | None = None
    distance: float | None = None
    marketing_carrier: Carrier | None = None
    marketing_carrier_flight_number: str | None = None
    operating_carrier: Carrier | None = None
    operating_carrier_flight_number: str | None = None
    aircraft: Aircraft | None = None
    # Technical stops (e.g. a refuelling stop with no plane change) within
    # this single flight number - distinct from a connection, which is a
    # separate segment entirely.
    stops: list[dict] = []
    passengers: list[OfferSegmentPassenger] = []


class OfferSlice(BaseSchema):
    id: str
    origin: Airport
    destination: Airport
    duration: str | None = None
    fare_brand_name: str | None = Field(
        default=None,
        description="e.g. Basic, Standard, Flex - airline's own fare tier name",
    )
    conditions: OfferSliceConditions | None = None
    segments: list[OfferSegment] = []


class OfferPassenger(BaseSchema):
    id: str
    type: PassengerType | None = None
    age: int | None = None
    fare_type: str | None = Field(
        default=None,
        description="e.g. student, same_day_change - special fare eligibility",
    )


class AvailableService(BaseSchema):
    """A purchasable ancillary on a priced offer - today only baggage
    (Duffel's only currently-supported available_services type). Only
    present when the offer was fetched with return_available_services=true
    (see external_services/flight.py's confirm_price). segment_ids/
    passenger_ids scope which segment(s) and passenger(s) this specific
    service applies to - a multi-segment trip typically needs a separate
    service purchased per segment for the same physical bag."""

    id: str
    type: str = Field(description="e.g. baggage")
    total_amount: str
    total_currency: str
    maximum_quantity: int = 1
    passenger_ids: list[str] = []
    segment_ids: list[str] = []
    metadata: dict = {}


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
    total_emissions_kg: str | int | float | None = None
    # True for a "self-transfer" itinerary Duffel has stitched together
    # from separate airlines' offers - no through check-in/baggage, and a
    # missed connection isn't the airline's responsibility. Worth flagging
    # in the UI once surfaced there; not acted on yet.
    partial: bool | None = None
    owner: Carrier | None = None
    slices: list[OfferSlice] = []
    passengers: list[OfferPassenger] = []
    passenger_identity_documents_required: bool = False
    # NOTE: Duffel's real field is `supported_passenger_identity_document_
    # types` - this was previously declared as `allowed_passenger_identity_
    # document_types`, a name Duffel doesn't actually send, so it silently
    # stayed [] forever under BaseSchema's extra="ignore".
    supported_passenger_identity_document_types: list[str] = []
    conditions: Conditions | None = None
    payment_requirements: PaymentRequirements | None = None
    # An explicit Duffel `null` (not just a missing key) is coerced to []
    # by BaseSchema._coerce_none_collections - see its docstring.
    available_services: list[AvailableService] = []


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
