"""add departure reminder fields

Everything the pre-departure reminder sweep (workers/reminders.py) needs:

- flight.origin_time_zone - Duffel's departing_at is a LOCAL time at the
  origin airport with no offset, so without the airport's IANA zone there
  is no way to know when a flight actually leaves. Nullable, and left
  NULL on existing rows: it can't be backfilled from anything already
  stored, and utils/flight_times.py deliberately skips a flight it can't
  place rather than guessing (a guess means a reminder up to fourteen
  hours off, possibly after the plane has gone).
- bookingslice.departure_reminder_sent_at - the claim that makes the
  sweep idempotent. Per slice, since a return leg needs its own reminder.
- notificationtype.DEPARTURE_REMINDER - the in-app counterpart.

Revision ID: f1c8cd1bebfc
Revises: d2ea7de43750
Create Date: 2026-08-12 15:41:02.118324

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1c8cd1bebfc"
down_revision: Union[str, Sequence[str], None] = "d2ea7de43750"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("flight", sa.Column("origin_time_zone", sa.String(), nullable=True))
    op.add_column(
        "bookingslice",
        sa.Column(
            "departure_reminder_sent_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    # Hand-written: autogenerate doesn't detect additions to an existing
    # native Postgres enum type. Safe alongside the DDL above because
    # nothing in this migration *uses* the new value - that's the only
    # thing ALTER TYPE ... ADD VALUE forbids inside a transaction.
    #
    # IF NOT EXISTS because a database bootstrapped by scripts/init_db.py
    # gets its enum from the models, which already list the value; without
    # it, upgrading such a database would abort here.
    op.execute(
        "ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DEPARTURE_REMINDER'"
    )


def downgrade() -> None:
    """Drops the two columns. The enum value stays: Postgres has no ALTER
    TYPE ... DROP VALUE, and rebuilding the type isn't worth it - an
    unused extra value is inert, whereas any already-sent
    DEPARTURE_REMINDER notification would have to be deleted to remove
    it."""
    op.drop_column("bookingslice", "departure_reminder_sent_at")
    op.drop_column("flight", "origin_time_zone")
