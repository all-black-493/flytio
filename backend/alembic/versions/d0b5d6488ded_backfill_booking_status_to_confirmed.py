"""backfill booking status to confirmed

Revision ID: d0b5d6488ded
Revises: 63d0ff05ce1f
Create Date: 2026-07-28 03:14:42.520118

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d0b5d6488ded"
down_revision: Union[str, Sequence[str], None] = "63d0ff05ce1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Data fix, not a schema change: crud/bookings.py's create_booking_
    from_order never set `status` explicitly, so every Booking row ever
    created silently took the model's PENDING default instead of
    CONFIRMED - even though a Booking row only ever gets created after
    Duffel has actually issued the order (see this model's own docstring:
    "A confirmed Duffel order"). Every existing PENDING booking is
    therefore genuinely confirmed; there's no ambiguous case to leave
    alone. Rows already CANCELLED are untouched.
    """
    op.execute("UPDATE booking SET status = 'CONFIRMED' WHERE status = 'PENDING'")


def downgrade() -> None:
    # Not meaningfully reversible - by the time this migration ran, every
    # PENDING row already represented a confirmed booking; reverting to
    # PENDING would restore the bug, not real prior state.
    pass
