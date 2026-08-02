import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """`datetime.now(UTC)`, not the deprecated `datetime.utcnow()` (which
    returns a naive datetime with no tzinfo at all, easy to silently
    mix up with a local time). Paired with `created_at`/`read_at`'s
    `sa_type=DateTime(timezone=True)` below, so this is timezone-aware
    all the way through: stored as `timestamptz` in Postgres, read back
    as an aware datetime, not just aware in Python before it hits the
    DB."""
    return datetime.now(UTC)


class NotificationType(str, enum.Enum):
    """One value per producer site (see crud/notifications.py) - kept as
    a real enum, not a free string, so a typo'd type can't silently
    create a notification the frontend has no icon/copy for."""

    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_FAILED = "booking_failed"
    AIRLINE_CHANGE = "airline_change"
    CANCELLATION_CONFIRMED = "cancellation_confirmed"
    CHANGE_CONFIRMED = "change_confirmed"
    SUPPORT_REQUEST = "support_request"
    DISCOUNT_REDEMPTION_FAILED = "discount_redemption_failed"


class Notification(SQLModel, table=True):
    """A single notification for a single recipient. Staff-facing events
    (SUPPORT_REQUEST, DISCOUNT_REDEMPTION_FAILED) fan out to one row per
    staff user at creation time (crud/notifications.py's notify_staff) -
    there's no separate "broadcast" concept, every row always belongs to
    exactly one user, so read/unread state is naturally per-recipient
    without needing a join table."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    user_id: uuid.UUID = Field(
        foreign_key="userindb.id", index=True, ondelete="CASCADE"
    )
    type: NotificationType
    title: str
    body: str | None = None
    # Where clicking the notification should take the user - e.g.
    # /account/bookings/{id} for a customer event, /admin/bookings/{id}
    # for a staff one. Left as a plain string rather than trying to model
    # every possible target as a structured reference.
    link_url: str | None = None
    read_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True), index=True
    )
