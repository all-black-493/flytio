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
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Join date - shown in the admin user list "
        "(routers/admin.py) and used for 'new users this week'-style "
        "dashboard metrics.",
    )
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
    is_staff: bool = Field(
        default=False,
        description="Can reach the staff/admin surface (routers/admin.py) "
        "at all - independent of any specific permission, same as "
        "Django's is_staff. See utils/rbac.py's require_staff.",
    )
    is_superuser: bool = Field(
        default=False,
        description="Implicitly has every permission (utils/rbac.py's "
        "has_perm) and can manage groups/permissions themselves - same as "
        "Django's is_superuser.",
    )
    banned_at: datetime | None = Field(
        default=None,
        description="Set by an admin (routers/admin.py's ban_user_route) "
        "to block login - unlike deleted_at, this never touches email/"
        "password, so it's fully reversible via unban_user_route and the "
        "account stays identifiable. get_current_user/authenticate_user "
        "both reject any account with this set, same as deleted_at.",
    )
    banned_reason: str | None = Field(default=None)
    banned_by_user_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="userindb.id",
        description="Which admin issued the ban - audit trail only, "
        "shown on the user detail page.",
    )

    bookings: list["Booking"] = Relationship(back_populates="user")
