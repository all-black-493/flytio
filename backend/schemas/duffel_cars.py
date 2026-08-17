"""Request schemas for the Duffel Cars API - car hire, the third Duffel
product surface after flights (duffel_flights.py) and accommodation
(duffel_stays.py).

Every field Duffel documents for `cars.search`, `cars.quotes.get` and
`cars.bookings.create` is modelled here, with its documented optionality.
Field names follow Duffel's snake_case wire format, the same convention
as the other two.

Response bodies are deliberately NOT modelled, and are returned to the
caller as raw dicts (see routers/cars.py). Duffel documents the request
parameters for Cars but not the response object shapes - typing them here
would mean inventing field names rather than transcribing confirmed ones,
and a wrong model is worse than none: it silently drops fields the caller
needed. duffel_stays.py made the same call for the same reason.

Why this matters beyond cars: pick-up and drop-off are expressed as
IATA-style location codes ("LHR"), which is what makes a car composable
with a flight - the drop-off airport of one leg is the pick-up location
of the next. That is the seam the multi-product package plan hangs on.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CarsSearchRequest(BaseSchema):
    """Duffel `cars.search`. Four required parameters, three optional.

    Times are separate from dates in Duffel's model rather than being
    datetimes: rental desks quote by local clock time at the branch, so
    there is no zone to attach - the same reason flight times arrive as
    naive local values (see utils/flight_times.py).
    """

    pick_up_location: str = Field(
        min_length=3,
        max_length=100,
        description=(
            "Location code or name, e.g. 'LHR'. An airport code is what "
            "links a rental to an arriving or departing flight."
        ),
    )
    drop_off_location: str | None = Field(
        default=None,
        min_length=3,
        max_length=100,
        description="Defaults to pick_up_location when omitted (one-way vs return hire).",
    )
    pick_up_date: date
    pick_up_time: str = Field(
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="HH:mm, 24-hour. Validated here so a malformed time fails at the edge rather than as an opaque Duffel 422.",
    )
    drop_off_date: date
    drop_off_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    driver_age: int | None = Field(
        default=None,
        ge=18,
        le=99,
        description=(
            "Optional, but worth sending: most suppliers price a young-driver "
            "surcharge, so omitting it can quote a price the renter cannot get."
        ),
    )

    @model_validator(mode="after")
    def _check_period(self):
        """Drop-off cannot precede pick-up. Caught here because Duffel's
        rejection of it is a generic 422 that says nothing useful to a
        traveller staring at a date picker."""
        if self.drop_off_date < self.pick_up_date:
            raise ValueError("drop_off_date cannot be before pick_up_date")
        if (
            self.drop_off_date == self.pick_up_date
            and self.drop_off_time <= self.pick_up_time
        ):
            # Lexicographic comparison is correct for zero-padded HH:mm,
            # which the pattern above guarantees.
            raise ValueError(
                "drop_off_time must be after pick_up_time on a same-day hire"
            )
        return self

    def to_duffel(self) -> dict:
        """Duffel's wire shape: dates as ISO strings, optional fields
        omitted rather than sent as null."""
        return self.model_dump(mode="json", exclude_none=True)


class CarsBookingRequest(BaseSchema):
    """Duffel `cars.bookings.create`. Only two documented fields.

    Sparse compared with a flight order - no passenger manifest, no
    payment object - because the rental agreement is formed at the desk
    against the renter's own licence and card. What Duffel books is the
    reservation; the supplier handles identity on collection.
    """

    quote_id: str = Field(
        min_length=1,
        description="From a search result, re-read via GET /cars/quotes/{id} to confirm it is still valid.",
    )
    renter_email: EmailStr = Field(
        description="Where the supplier sends the confirmation. Not necessarily the flyt account holder's address."
    )

    def to_duffel(self) -> dict:
        return self.model_dump(mode="json")
