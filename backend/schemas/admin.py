"""Response schemas for the staff/admin surface (routers/admin.py) - keeps
routers/admin.py free of ad-hoc dict responses, same Public/Read pattern
as schemas/bookings.py.
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from backend.schemas.bookings import BookingPublic
from backend.schemas.common import PaginationMeta
from backend.schemas.payments import CheckoutRequest


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
    banned_at: datetime | None = None
    banned_reason: str | None = None


class AdminUserDetail(AdminUserRead):
    """Extends the list row with fields only worth fetching for one user
    at a time (routers/admin.py's get_user_detail) - group_ids in
    particular would mean an extra query per row if it were on
    AdminUserRead instead."""

    group_ids: list[int]
    banned_by_email: str | None = None


class AdminUserListResponse(SQLModel):
    data: list[AdminUserRead]
    meta: PaginationMeta


class BanUserRequest(SQLModel):
    reason: str = Field(min_length=1)


class AdminBookingRead(BookingPublic):
    """BookingPublic plus who it belongs to - BookingPublic itself has no
    owner field since a customer's own booking list is implicitly
    'yours'; staff need to see whose it is."""

    user_id: uuid.UUID
    user_email: str


class AdminBookingListResponse(SQLModel):
    data: list[AdminBookingRead]
    meta: PaginationMeta


class AdminCreateBookingRequest(CheckoutRequest):
    """CheckoutRequest plus which existing customer this booking belongs
    to - the customer must already have a flyt account, there's no
    guest-booking concept in this schema (see
    crud/payments.py's create_admin_booking)."""

    user_id: uuid.UUID


class SetStaffRequest(SQLModel):
    is_staff: bool


class PricingSaleRead(SQLModel):
    id: uuid.UUID
    name: str
    markup_rate: float
    starts_at: datetime
    ends_at: datetime
    created_by_user_id: uuid.UUID
    created_at: datetime


class CreatePricingSaleRequest(SQLModel):
    name: str = Field(min_length=1)
    markup_rate: float = Field(ge=0, le=1, description="e.g. 0.03 for 3%")
    starts_at: datetime
    ends_at: datetime


class DiscountCodeRead(SQLModel):
    id: uuid.UUID
    code: str
    discount_percentage: float
    max_redemptions: int | None
    times_redeemed: int
    expires_at: datetime | None
    is_active: bool
    created_by_user_id: uuid.UUID
    created_at: datetime


class CreateDiscountCodeRequest(SQLModel):
    code: str = Field(min_length=1)
    discount_percentage: float = Field(gt=0, le=100)
    max_redemptions: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None


class SetDiscountCodeActiveRequest(SQLModel):
    is_active: bool
