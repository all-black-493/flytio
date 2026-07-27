from datetime import datetime

from pydantic import EmailStr
import uuid
from typing import TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from backend.models.bookings import Booking


class UserInDB(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: EmailStr = Field(index=True, unique=True)
    password: str
    password_changed_at: datetime | None = Field(
        default=None,
        description="Set on every password reset. Access tokens issued "
        "before this timestamp are rejected by get_current_user, so a "
        "reset also invalidates any already-issued session.",
    )
    deleted_at: datetime | None = Field(
        default=None,
        description="Set when the account owner deletes their account. "
        "The row itself is kept (not hard-deleted) so booking/payment "
        "history stays intact - email/password are scrubbed instead (see "
        "crud/users.py's delete_user_account), and get_current_user/"
        "authenticate_user both reject any account with this set.",
    )

    bookings: list["Booking"] = Relationship(back_populates="user")
