"""backfill flight.origin_time_zone

f1c8cd1bebfc added the column and left it NULL on existing rows, noting
that it "can't be backfilled from anything already stored". That turns
out to be wrong in a useful way: flight.origin_iata_code is stored, and
an airport's IANA zone follows from its IATA code. airportsdata carries
that mapping offline, so no API call and no guessing is involved.

This matters because until it runs, every flight booked before
f1c8cd1bebfc has a NULL zone, utils/flight_times.py refuses to place it,
and the departure sweep therefore skips every existing booking - the
feature does nothing for anyone currently booked.

Only NULL rows are touched, so this is safe to re-run and cannot
overwrite a zone Duffel supplied. A code airportsdata does not know is
left NULL rather than guessed, which keeps flight_times.py's contract: a
leg that cannot be placed is skipped, never reminded at the wrong hour.

Revision ID: a7c3f9b21d04
Revises: f1c8cd1bebfc
Create Date: 2026-10-22 05:20:00.000000

"""

from typing import Sequence, Union

import airportsdata
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c3f9b21d04"
down_revision: Union[str, Sequence[str], None] = "f1c8cd1bebfc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    codes = bind.execute(
        sa.text(
            "SELECT DISTINCT origin_iata_code FROM flight "
            "WHERE origin_time_zone IS NULL AND origin_iata_code IS NOT NULL"
        )
    ).scalars()

    airports = airportsdata.load("IATA")
    for code in codes:
        airport = airports.get((code or "").strip().upper())
        if not airport or not airport.get("tz"):
            continue
        bind.execute(
            sa.text(
                "UPDATE flight SET origin_time_zone = :tz "
                "WHERE origin_iata_code = :code AND origin_time_zone IS NULL"
            ),
            {"tz": airport["tz"], "code": code},
        )


def downgrade() -> None:
    """Deliberately does nothing.

    Rows filled here are indistinguishable from rows Duffel supplied, so
    setting them back to NULL would discard real data to undo a backfill.
    """
