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

    bookings: list["Booking"] = Relationship(back_populates="user")
