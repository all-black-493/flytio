"""Import every table model here so SQLModel.metadata knows about all of
them before crud.db.init_db() calls create_all() at app startup."""

from backend.models.bookings import Booking, BookingPassenger, BookingSlice  # noqa: F401
from backend.models.flights import Flight  # noqa: F401
from backend.models.payments import Payment  # noqa: F401
from backend.models.tickets import Ticket  # noqa: F401
from backend.models.users import UserInDB  # noqa: F401
