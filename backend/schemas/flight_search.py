from pydantic import BaseModel, Field, ConfigDict
from datetime import date, time


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


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
    travelerType: str
    associatedAdultId: str | None = None


class AdditionalInformation(BaseSchema):
    chargeableCheckedBags: bool
    brandedFares: bool
    fareRules: bool


class PricingOptions(BaseSchema):
    includedCheckedBagsOnly: bool


class CabinRestriction(BaseSchema):
    cabin: str
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


class SearchCriteria(BaseSchema):
    excludeAllotments: bool
    addOneWayOffers: bool
    maxFlightOffers: int
    allowAlternativeFareOptions: bool
    oneFlightOfferPerDay: bool
    additionalInformation: AdditionalInformation
    pricingOptions: PricingOptions
    flightFilters: FlightFilters


class FlightSearchRequestPost(BaseSchema):
    currencyCode: str
    originDestinations: list[OriginDestination]
    travelers: list[Traveler]
    sources: list[str]
    searchCriteria: SearchCriteria


class FlightSearchRequestGet(BaseSchema):
    originLocationCode: str
    destinationLocationCode: str
    departureDate: str
    adults: int = Field(default=1)
    max: int = Field(default=5)
    returnDate: str | None = None
    children: int | None = None
    infants: int | None = None
    travelClass: str | None = None
    includedAirlineCodes: str | None = None
    excludedAirlineCodes: str | None = None
    nonStop: bool | None
    currencyCode: str = Field(default="USD")
    maxPrice: int | None
