"""The one way this codebase gets the current time.

Lived in models/notifications.py until a second caller needed it
(crud/reminders.py); a notifications module owning the general clock
helper was only ever incidental.
"""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """`datetime.now(UTC)`, not the deprecated `datetime.utcnow()` (which
    returns a naive datetime with no tzinfo at all, easy to silently mix
    up with a local time). Pair it with `sa_type=DateTime(timezone=True)`
    on the column, so the value is timezone-aware all the way through:
    stored as `timestamptz` in Postgres, read back as an aware datetime,
    not just aware in Python before it hits the DB."""
    return datetime.now(UTC)
