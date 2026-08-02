"""Order creation/management schemas (Duffel API v2) - booking a priced
offer, reading back the resulting order, cancelling it, and changing it.
Split out of duffel_flights.py (which now holds only the shopping/offer
side) since order management is a distinct phase of the booking
lifecycle with its own request/response shapes; some response models
here (OrderSegment, OrderSlice) reuse offer-side component types
(Airport, Carrier, Aircraft, OfferSegmentPassenger) since Duffel's order
object embeds the same shapes.
"""

from datetime import date, datetime

from pydantic import EmailStr, Field, field_validator

from backend.schemas.common import BaseSchema, not_in_future
from backend.schemas.duffel_flights import (
    Aircraft,
    Airport,
    Carrier,
    Conditions,
    OfferSegmentPassenger,
    PassengerType,
)

# Order creation request models


class IdentityDocument(BaseSchema):
    """A passport/tax-id required by some itineraries - see `Offer.
    passenger_identity_documents_required`. Passed straight through to
    Duffel's order-creation payload."""

    unique_identifier: str = Field(description="Document/passport number")
    type: str = Field(default="passport", description="passport or tax_id")
    issuing_country_code: str = Field(min_length=2, max_length=2)
    expires_on: date


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
    identity_documents: list[IdentityDocument] | None = Field(
        default=None,
        description="Required when the offer's passenger_identity_documents_required is true",
    )
    seat_designator: str | None = Field(
        default=None,
        description=(
            "Seat picked in our own seat-map UI (e.g. '14C'), stored on our "
            "booking record for display. Not itself sent to Duffel - "
            "seat_service_id below is what actually reserves it."
        ),
    )
    seat_service_id: str | None = Field(
        default=None,
        description=(
            "The seat's `available_services[].id` (ase_...) from GET "
            "/air/seat_maps, for THIS passenger. Stripped from the "
            "passenger payload before sending to Duffel (it's not a real "
            "passenger field) and instead collected into OrderCreate."
            "services below, so the airline actually holds the seat."
        ),
    )
    extra_baggage_service_ids: list[str] = Field(
        default_factory=list,
        description=(
            "Purchasable-baggage `available_services[].id` (ase_.../bag_...) "
            "picked for this passenger. Same treatment as seat_service_id - "
            "stripped from the passenger payload and collected into "
            "OrderCreate.services instead."
        ),
    )

    _validate_born_on = field_validator("born_on")(not_in_future)


class OrderPayment(BaseSchema):
    type: str = Field(default="balance", description="balance or arc_bsp_cash")
    currency: str = Field(min_length=3, max_length=3)
    amount: str = Field(description="Must match the offer's total_amount")


class OrderService(BaseSchema):
    """A paid ancillary to attach to the order - seats
    (OrderPassenger.seat_service_id) and extra baggage
    (OrderPassenger.extra_baggage_service_ids), one entry per
    service/passenger combination."""

    id: str
    quantity: int = 1


class OrderCreate(BaseSchema):
    selected_offers: list[str] = Field(
        min_length=1, max_length=1, description="A single offer ID to book"
    )
    passengers: list[OrderPassenger] = Field(min_length=1)
    payments: list[OrderPayment] = Field(min_length=1)
    services: list[OrderService] | None = None
    metadata: dict[str, str] | None = Field(
        default=None,
        description=(
            "Arbitrary key-value pairs Duffel stores on the order and "
            "echoes back on every future read - our own reconciliation "
            "hook back to Payment/Booking, independent of Duffel's own "
            "order/booking_reference IDs."
        ),
    )


# Order response models


class OrderSegment(BaseSchema):
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
    stops: list[dict] = []
    passengers: list[OfferSegmentPassenger] = []


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
    conditions: Conditions | None = None
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


# Order change models (Duffel's 4-step flow: request -> review offers ->
# create a pending change -> confirm with payment). Response shapes here
# are only partially confirmed against Duffel's published docs (no full
# field list for a change offer's `new_flight_segments`) - kept minimal
# and typed only for what's confirmed, rather than guessing field names.


class OrderChangeSliceRemove(BaseSchema):
    slice_id: str


class OrderChangeSliceAdd(BaseSchema):
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    departure_date: date
    cabin_class: str | None = None


class OrderChangeSlices(BaseSchema):
    """Step 1 request body: describe what should change - which slice(s)
    to remove and what new slice(s) to search for in their place. The
    order_id itself comes from the URL path
    (routers/bookings.py's create_order_change_request), not this body.
    Doesn't touch the order yet; just returns candidate offers to
    review."""

    remove: list[OrderChangeSliceRemove] = Field(min_length=1)
    add: list[OrderChangeSliceAdd] = Field(min_length=1)


class OrderChangeRequest(BaseSchema):
    id: str
    order_id: str | None = None
    live_mode: bool | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class OrderChangeRequestResponse(BaseSchema):
    data: OrderChangeRequest


class OrderChangeOffer(BaseSchema):
    """Step 2: one priced way to satisfy the change request - the
    customer picks one of these to proceed with."""

    id: str
    order_id: str | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
    change_total_amount: str | None = None
    change_total_currency: str | None = None
    new_total_amount: str | None = None
    new_total_currency: str | None = None
    penalty_total_amount: str | None = None
    penalty_total_currency: str | None = None
    refund_to: str | None = None
    live_mode: bool | None = None


class OrderChangeOffersData(BaseSchema):
    offers: list[OrderChangeOffer] = []


class OrderChangeOffersResponse(BaseSchema):
    data: OrderChangeOffersData


class OrderChangeCreate(BaseSchema):
    """Step 3: create a pending change from a chosen offer - not
    confirmed/charged yet."""

    selected_order_change_offer: str = Field(
        description="An order_change_offer id (oco_...)"
    )


class OrderChangePayment(BaseSchema):
    type: str = Field(default="balance")
    currency: str = Field(min_length=3, max_length=3)
    amount: str


class OrderChangeConfirm(BaseSchema):
    """Step 4: pay for and finalize the pending change."""

    payment: OrderChangePayment


class OrderChange(BaseSchema):
    id: str
    order_id: str | None = None
    confirmed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    change_total_amount: str | None = None
    change_total_currency: str | None = None
    new_total_amount: str | None = None
    new_total_currency: str | None = None
    penalty_total_amount: str | None = None
    penalty_total_currency: str | None = None
    refund_to: str | None = None


class OrderChangeResponse(BaseSchema):
    data: OrderChange
