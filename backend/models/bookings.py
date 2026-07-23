import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.models.flights import Flight
    from backend.models.users import UserInDB


class BookingStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class PassengerType(str, enum.Enum):
    ADULT = "adult"
    CHILD = "child"
    INFANT_WITHOUT_SEAT = "infant_without_seat"


class CabinClass(str, enum.Enum):
    FIRST = "first"
    BUSINESS = "business"
    PREMIUM_ECONOMY = "premium_economy"
    ECONOMY = "economy"


class Booking(SQLModel, table=True):
    """A confirmed Duffel order, owned by one user, made up of one or more
    slices (outbound/return/multi-city legs) and one or more passengers."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    user_id: uuid.UUID = Field(
        foreign_key="userindb.id", index=True, ondelete="CASCADE"
    )

    duffel_order_id: str = Field(
        nullable=False, unique=True, index=True, description="ord_..."
    )
    booking_reference: str = Field(nullable=False, index=True)
    status: BookingStatus = Field(default=BookingStatus.PENDING)

    total_amount: str
    total_currency: str
    owner_iata_code: str | None = Field(
        default=None, description="Owning airline, e.g. EK"
    )
    owner_name: str | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    cancelled_at: datetime | None = None

    user: "UserInDB" = Relationship(back_populates="bookings")
    slices: list["BookingSlice"] = Relationship(
        back_populates="booking", cascade_delete=True
    )
    passengers: list["BookingPassenger"] = Relationship(
        back_populates="booking", cascade_delete=True
    )


class BookingSlice(SQLModel, table=True):
    """One directional leg of a booking (e.g. outbound or return), made up
    of one or more flights (segments) for connections."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    booking_id: uuid.UUID = Field(
        foreign_key="booking.id", index=True, ondelete="CASCADE"
    )

    duffel_slice_id: str = Field(nullable=False)
    origin_iata_code: str = Field(nullable=False)
    origin_name: str | None = None
    origin_city_name: str | None = None
    destination_iata_code: str = Field(nullable=False)
    destination_name: str | None = None
    destination_city_name: str | None = None
    duration: str | None = Field(
        default=None, description="ISO 8601 duration, e.g. PT7H58M"
    )

    booking: Booking = Relationship(back_populates="slices")
    flights: list["Flight"] = Relationship(back_populates="slice", cascade_delete=True)


class BookingPassenger(SQLModel, table=True):
    """A named passenger on a booking, with their seat/cabin for this trip."""

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4, nullable=False, primary_key=True, index=True
    )
    booking_id: uuid.UUID = Field(
        foreign_key="booking.id", index=True, ondelete="CASCADE"
    )

    duffel_passenger_id: str = Field(nullable=False)
    passenger_type: PassengerType | None = None
    given_name: str
    family_name: str
    born_on: date | None = None
    email: str | None = None
    phone_number: str | None = None
    infant_passenger_id: str | None = Field(
        default=None, description="For adults responsible for an infant on this booking"
    )

    seat_designator: str | None = Field(default=None, description="e.g. C2")
    cabin_class: CabinClass | None = None

    booking: Booking = Relationship(back_populates="passengers")
