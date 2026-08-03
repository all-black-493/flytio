"""Bootstraps the schema on a database that has none, then marks it as
already migrated. Runs before `alembic upgrade head` (see compose.yaml).

Why this exists: the migration chain cannot build a database from
nothing. Its root revision (de2067dfce59, "baseline") opens by running
`UPDATE payment SET provider = ...` against a `payment` table it assumes
is already there, and no revision anywhere calls create_table - the
schema was originally produced by SQLModel.metadata.create_all(), and
every migration written since only alters what that call had already
made. On an existing database that is fine. On an empty one - a fresh
Postgres volume on a new server, say - Alembic fails on its very first
statement with `relation "payment" does not exist`, which takes the app
container down with it.

So: an empty database gets the current schema directly from the models
and is stamped at head, since those migrations describe changes it was
born with. A database that already has tables is left completely alone,
including one predating Alembic - that is exactly the case the existing
chain was written for, and it still runs normally afterwards.

The tradeoff is worth stating plainly: a fresh database arrives at the
schema without replaying history, so the two paths can drift if a
migration ever does something create_all() would not (a data backfill,
a constraint added out-of-band). The durable fix is a real initial
migration that creates the tables; until then this keeps fresh installs
working without rewriting the chain.
"""

import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlmodel import SQLModel, create_engine

import backend.models  # noqa: F401 - registers every table on SQLModel.metadata
from backend.config import settings
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


def main() -> int:
    engine = create_engine(settings.DATABASE_URL)

    existing = inspect(engine).get_table_names()
    if existing:
        # Includes the pre-Alembic case (tables but no alembic_version):
        # leaving it untouched is what lets the baseline revision do the
        # job it was written for.
        logger.info(
            "Database already has %d table(s) - leaving the schema to Alembic",
            len(existing),
        )
        return 0

    logger.info("Empty database - creating the schema from the models")
    SQLModel.metadata.create_all(engine)

    # Stamp rather than upgrade: the schema just created already
    # incorporates every migration, so replaying them would fail on the
    # first ALTER of a column that is already in its final shape.
    config = Config("alembic.ini")
    command.stamp(config, "head")
    logger.info("Schema created and stamped at head")
    return 0


if __name__ == "__main__":
    sys.exit(main())
