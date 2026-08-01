"""add admin payment provider

Revision ID: d5121a4370b4
Revises: b0921550f592
Create Date: 2026-07-31 01:08:45.416927

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d5121a4370b4"
down_revision: Union[str, Sequence[str], None] = "b0921550f592"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Autogenerate doesn't detect additions to an existing native Postgres
    enum type (models/payments.py's PaymentProvider), so this is written
    by hand - ALTER TYPE ... ADD VALUE can't run inside the same
    transaction that later uses the new value, but just adding it (with
    nothing else in this migration) is safe under Alembic's default
    transactional-DDL wrapping.
    """
    op.execute("ALTER TYPE paymentprovider ADD VALUE 'ADMIN'")


def downgrade() -> None:
    """Postgres has no ALTER TYPE ... DROP VALUE - removing an enum value
    means rebuilding the type, which isn't worth it for a downgrade path
    (no row will actually use 'ADMIN' unless an admin booking was created,
    which a downgrade should surface as a real conflict, not silently
    paper over)."""
    raise NotImplementedError(
        "Cannot downgrade: Postgres doesn't support dropping an enum value "
        "(paymentprovider.ADMIN). Restore from a backup if you need to "
        "reverse this."
    )
