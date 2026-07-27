"""Import every table model here so SQLModel.metadata knows about all of
them - needed before alembic/env.py's autogenerate can see them, and by
each test file's own create_all() against its isolated SQLite engine."""

from backend.models.bookings import Booking, BookingPassenger, BookingSlice  # noqa: F401
from backend.models.flights import Flight  # noqa: F401
from backend.models.payments import Payment  # noqa: F401
from backend.models.tickets import Ticket  # noqa: F401
from backend.models.users import UserInDB  # noqa: F401
