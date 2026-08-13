"""Brings the database schema up to date, and nothing else.

    python -m backend.scripts.migrate

The single definition of "prepare the schema", so the three places that
need it stay in step: compose's `migrate` service, a Kubernetes init
container or Job, and a developer running it by hand. Previously this was
a `&&` chain written into the image's CMD and duplicated in compose,
which meant it also ran on every app start - fine for one container,
wrong the moment there is more than one replica racing to ALTER the same
tables.

Bootstrap and upgrade in one command because they are one decision, not
two: scripts/init_db.py explains why an empty database cannot simply be
migrated from nothing, and any caller that needs one needs the other.
"""

import sys

from alembic import command
from alembic.config import Config

from backend.scripts.init_db import main as bootstrap_schema
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


def main() -> int:
    # No-ops on a database that already has tables, so this is safe to run
    # on every deploy - it only does anything on a genuinely empty one.
    result = bootstrap_schema()
    if result != 0:
        logger.error("Schema bootstrap failed - not attempting to migrate")
        return result

    logger.info("Applying migrations")
    command.upgrade(Config("alembic.ini"), "head")
    logger.info("Schema is up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
