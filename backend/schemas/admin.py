"""Response schemas for the staff/admin surface (routers/admin.py) - keeps
routers/admin.py free of ad-hoc dict responses, same Public/Read pattern
as schemas/bookings.py.
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from backend.schemas.bookings import BookingPublic
from backend.schemas.common import PaginationMeta


class CurrencyTotal(SQLModel):
    currency: str
    total_amount: str


class AdminDashboardSummary(SQLModel):
    total_bookings: int
    bookings_today: int
    bookings_this_week: int
    total_users: int
    active_users: int = Field(
        description="Distinct users with at least one Booking row (any "
        "status) - see crud/users.py's count_active_users docstring for "
        "why this definition was picked over a fuzzier 'recently active' "
        "signal flyt doesn't track anywhere."
    )
    revenue: list[CurrencyTotal] = Field(
        description="Grouped by currency, never summed across currencies "
        "- see crud/bookings.py's get_revenue_by_currency docstring."
    )


class AdminUserRead(SQLModel):
    id: uuid.UUID
    email: str
    is_staff: bool
    is_superuser: bool
    created_at: datetime
    deleted_at: datetime | None = None


class AdminUserListResponse(SQLModel):
    data: list[AdminUserRead]
    meta: PaginationMeta


class AdminBookingRead(BookingPublic):
    """BookingPublic plus who it belongs to - BookingPublic itself has no
    owner field since a customer's own booking list is implicitly
    'yours'; staff need to see whose it is."""

    user_id: uuid.UUID
    user_email: str


class AdminBookingListResponse(SQLModel):
    data: list[AdminBookingRead]
    meta: PaginationMeta


class SetStaffRequest(SQLModel):
    is_staff: bool
