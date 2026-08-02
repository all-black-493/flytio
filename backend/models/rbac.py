"""Django-auth-shaped RBAC: Group/Permission plus the group- and
user-level grant tables, backing utils/rbac.py's has_perm() and the
staff/admin surface in routers/admin.py.

Two deliberate simplifications versus real Django, both because this is
a single-app FastAPI backend rather than Django's multi-app project:
- No ContentType/app-registry table - Permission.content_type is a plain
  string (e.g. "booking"), not a FK, since codenames are already globally
  unique on their own (no two managed models share an action name).
- No "app_label.codename" permission strings - just the bare codename.

Int auto-PKs on Group/Permission (matching Django's AutoField there),
unlike this repo's usual UUID PKs on domain models - these are simple
lookup tables, not domain entities.
"""

import uuid

from sqlmodel import Field, SQLModel


class Group(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)


class Permission(SQLModel, table=True):
    """One codename per (action, managed model) pair - see utils/rbac.py's
    MANAGED_MODELS/ACTIONS and seed_permissions() for how these get
    created."""

    id: int | None = Field(default=None, primary_key=True)
    codename: str = Field(unique=True, index=True, description="e.g. 'view_booking'")
    name: str = Field(description="Human-readable, e.g. 'Can view booking'")
    content_type: str = Field(index=True, description="e.g. 'booking'")


class GroupPermission(SQLModel, table=True):
    """A permission granted to every member of a group."""

    group_id: int = Field(foreign_key="group.id", primary_key=True, ondelete="CASCADE")
    permission_id: int = Field(
        foreign_key="permission.id", primary_key=True, ondelete="CASCADE"
    )


class UserGroup(SQLModel, table=True):
    """Group membership - grants that group's permissions to the user."""

    user_id: uuid.UUID = Field(
        foreign_key="userindb.id", primary_key=True, ondelete="CASCADE"
    )
    group_id: int = Field(foreign_key="group.id", primary_key=True, ondelete="CASCADE")


class UserPermission(SQLModel, table=True):
    """A permission granted directly to one user, bypassing group
    membership - mirrors Django's user.user_permissions."""

    user_id: uuid.UUID = Field(
        foreign_key="userindb.id", primary_key=True, ondelete="CASCADE"
    )
    permission_id: int = Field(
        foreign_key="permission.id", primary_key=True, ondelete="CASCADE"
    )
