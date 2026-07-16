from pydantic import BaseModel, Field, ConfigDict
from datetime import date, time, datetime
from typing import Any


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class DepartureDateTimeRange(BaseSchema):
    departure_date: date = Field(
        ..., alias="date", description="Departure date in YYY-MM-DD format"
    )
    departure_time: time = Field(
        ..., alias="time", description="Departure time in HH:MM:SS format"
    )


class OriginDestination(BaseSchema):
    id: str = Field(..., description="Unique identifier for the origin destination")
    originLocationCode: str = Field(..., description="IATA code for the origin airport")
    destinationLocationCode: str = Field(
        ..., description="IATA code for the destination airport"
    )
    departureDateTimeRange: DepartureDateTimeRange = Field(
        ..., description="Departure date and time range"
    )


class Traveler(BaseSchema):
    id: str = Field(..., description="Unique identifier for the traveler")
    travelerType: str = Field(
        ..., description="Type of Traveler (e.g., ADULT, CHILD, SENIOR)"
    )
    associatedAdultId: str | None = None


class CabinRestriction(BaseSchema):
    cabin: str = Field(
        ..., description="Cabin class(e.g., ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST)"
    )
    coverage: str = Field(
        ..., description="Coverage type (e.g., MOST_SEGMENTS, ALL_SEGMENTS)"
    )
    originDestinationIds: list[str] = Field(
        ..., description="List of origin-destination IDs"
    )


class FlightFilters(BaseSchema):
    cabinRestrictions: list[CabinRestriction] | None = None


class SearchCriteria(BaseSchema):
    maxFlightOffers: int | None = None
    flightFilters: FlightFilters | None = None


class AmadeusFlightSearchRequest(BaseSchema):
    currencyCode: str = Field(
        min_length=3,
        max_length=3,
        description="Currency code for pricing (e.g., USD, EUR)",
    )
    originDestinations: list[OriginDestination] = Field(
        ..., description="List of origin-destination"
    )
    travelers: list[Traveler] = Field(..., description="List of travelers")
    sources: list[str] = Field(..., description="Data sources (e.g., GDS)")
    searchCriteria: SearchCriteria | None = None


class IncludedCheckedBags(BaseSchema):
    quantity: int | None = None
    weight: int | None = None
    weightUnit: str | None = None


# Response Models


class Location(BaseSchema):
    iataCode: str
    terminal: str | None = None
    at: datetime


class Aircraft(BaseSchema):
    code: str = Field(..., description="Aircraft code")


class Operating(BaseSchema):
    carrierCode: str = Field(..., description="Operating carrier code")


class Segment(BaseSchema):
    departure: Location
    arrival: Location
    carrierCode: str
    number: str
    aircraft: Aircraft
    operating: Operating
    duration: str
    id: str
    numberOfStops: int
    blacklisted_in_eu: bool = Field(alias="blacklistedInEU")


class Itinerary(BaseSchema):
    duration: str
    segments: list[Segment]


class Fee(BaseSchema):
    amount: str = Field(..., description="Fee amount")
    type: str = Field(..., description="Fee type")


class Price(BaseSchema):
    currency: str
    total: str
    base: str
    fees: list[Fee] | None = None
    grandTotal: str | None = None


class PricingOptions(BaseSchema):
    fareType: list[str]
    includedCheckedBagsOnly: bool


class FareDetailsBySegment(BaseSchema):
    segmentId: str
    cabin: str
    fareBasis: str
    class_: str = Field(alias="class")
    includedCheckedBags: IncludedCheckedBags | None = None


class TravelerPricing(BaseSchema):
    travelerId: str
    fareOption: str
    travelerType: str
    price: Price
    fareDetailsBySegment: list[FareDetailsBySegment]


class FlightOfferRequest(BaseSchema):
    type: str = "flight-offer"
    id: str
    source: str
    instantTicketingRequired: bool
    nonHomogeneous: bool
    oneWay: bool
    isUpsellOffer: bool | None = None
    lastTicketingDate: date
    lastTicketingDateTime: datetime | None = None
    numberOfBookableSeats: int
    itineraries: list[Itinerary]
    price: Price
    pricingOptions: PricingOptions
    validatingAirlineCodes: list[str]
    travelerPricings: list[TravelerPricing]


class FlightOfferPriceRequest(BaseSchema):
    originLocationCode: str = Field(description="Origin airport or city IATA code")
    destinationLocationCode: str = Field(
        description="Destination airport or city IATA code"
    )
    departureDate: date = Field(description="Departure date (YYYY-MM-DD)")
    adults: int = Field(ge=1, description="Number of adult travelers")


class LocationInfo(BaseSchema):
    cityCode: str
    countryCode: str


class Dictionaries(BaseSchema):
    locations: dict[str, LocationInfo]
    aircraft: dict[str, str]
    currencies: dict[str, str]
    carriers: dict[str, str]


class FlightSearchResponse(BaseSchema):
    meta: dict[str, Any]
    data: list[FlightOfferRequest]
    dictionaries: Dictionaries


class ErrorSource(BaseSchema):
    parameter: str | None = None
    example: str | None = None


class Error(BaseSchema):
    status: int
    code: int
    title: str
    detail: str | None = None
    source: ErrorSource | None = None


class ErrorResponse(BaseSchema):
    errors: list[Error]
