from pydantic import BaseModel, Field, ConfigDict
from datetime import date, time, datetime
from typing import Any
import enum


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class TravelerType(str, enum.Enum):
    ADULT = "ADULT"
    CHILD = "CHILD"
    HELD_INFANT = "HELD_INFANT"


class CabinType(str, enum.Enum):
    ECONOMY = "ECONOMY"
    PREMIUM_ECONOMY = "PREMIUM_ECONOMY"
    BUSINESS = "BUSINESS"
    FIRST = "FIRST"


class DepartureDateTimeRange(BaseSchema):
    departure_date: date = Field(..., alias="date")
    departure_time: time = Field(..., alias="time")


class OriginDestination(BaseSchema):
    id: str
    originLocationCode: str
    destinationLocationCode: str
    departureDateTimeRange: DepartureDateTimeRange


class Traveler(BaseSchema):
    id: str = Field(..., description="Unique identifier for the traveler")
    travelerType: TravelerType
    associatedAdultId: str | None = None


class CabinRestriction(BaseSchema):
    cabin: CabinType
    coverage: str = "MOST_SEGMENTS"
    originDestinationIds: list[str]


class ConnectionRestriction(BaseSchema):
    airportChangeAllowed: bool
    technicalStopsAllowed: bool


class CarrierRestrictions(BaseSchema):
    blacklistedInEUAllowed: bool
    includedCarrierCodes: list[str]


class FlightFilters(BaseSchema):
    cabinRestrictions: list[CabinRestriction]
    crossBorderAllowed: bool
    moreOvernightsAllowed: bool
    returnToDepartureAirport: bool
    railSegmentAllowed: bool
    busSegmentAllowed: bool
    carrierRestrictions: CarrierRestrictions
    connectionRestriction: ConnectionRestriction


class PricingOptions(BaseSchema):
    fareType: list[str]
    includedCheckedBagsOnly: bool


class AdditionalInformation(BaseSchema):
    chargeableCheckedBags: bool
    brandedFares: bool
    fareRules: bool


class SearchCriteria(BaseSchema):
    excludeAllotments: bool
    addOneWayOffers: bool
    maxFlightOffers: int
    allowAlternativeFareOptions: bool
    oneFlightOfferPerDay: bool
    additionalInformation: AdditionalInformation
    pricingOptions: PricingOptions
    flightFilters: FlightFilters


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


class Bags(BaseSchema):
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
    fees: list["Fee"]
    grandTotal: str
    additionalServices: list["AdditionalService"]


class AdditionalService(BaseModel):
    amount: str
    type: str


class FareDetailsBySegment(BaseSchema):
    segmentId: str
    cabin: str
    fareBasis: str
    brandedFare: str
    brandedFareLabel: str
    class_: str = Field(alias="class")
    includedCheckedBags: "Bags"
    includedCabinBags: "Bags"
    amenities: list["Amenity"]


class TravelerPricing(BaseSchema):
    travelerId: str
    fareOption: str
    travelerType: str
    price: "TravelerPrice"
    fareDetailsBySegment: list[FareDetailsBySegment]


class TravelerPrice(BaseSchema):
    currency: str
    total: str
    base: str


class Amenity(BaseSchema):
    description: str
    isChargeable: bool
    amenityType: str
    amenityProvider: "AmenityProvider"


class AmenityProvider(BaseSchema):
    name: str


class FlightOfferRequest(BaseSchema):
    type: str = "flight-offer"
    id: str
    source: str
    instantTicketingRequired: bool
    nonHomogeneous: bool
    oneWay: bool
    isUpsellOffer: bool
    lastTicketingDate: date
    lastTicketingDateTime: datetime
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


class FlightSearchResponse(BaseSchema):
    meta: dict[str, Any]
    data: list[FlightOfferRequest]
    dictionaries: dict[str, Any] | None = None


class FlightPricingResponse(BaseSchema):
    data: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


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
