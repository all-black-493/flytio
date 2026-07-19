from pydantic import BaseModel, Field, ConfigDict


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Aircraft(BaseSchema):
    code: str = Field(..., description="Aircraft code")


class Operating(BaseSchema):
    carrierCode: str = Field(..., description="Operating carrier code")


class Location(BaseSchema):
    iataCode: str
    terminal: str | None = None
    at: str


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


class AdditionalService(BaseModel):
    amount: str
    type: str


class Price(BaseSchema):
    currency: str
    total: str
    base: str
    fees: list["Fee"]
    grandTotal: str
    additionalServices: list["AdditionalService"]


class PricingOptions(BaseSchema):
    fareType: list[str]
    includedCheckedBagsOnly: bool


class FlightOfferRequest(BaseSchema):
    type: str
    id: str
    source: str
    instantTicketingRequired: bool
    nonHomogeneous: bool
    oneWay: bool
    isUpsellOffer: bool
    lastTicketingDate: str
    lastTicketingDateTime: str
    numberOfBookableSeats: int
    itineraries: list
    price: Price
    pricingOptions: PricingOptions
    validatingAirlineCodes: list
    travelerPricings: list
    totalPrice: str = None
    totalPriceBase: str = None
    fareType: str = None
