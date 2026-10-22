"""Locates alembic.ini without depending on the working directory.

Both migration entrypoints used to build `Config("alembic.ini")`, which
only resolves when the process happens to start in backend/. That held
for Compose, whose working directory is the image's /backend, and breaks
anywhere else - notably Vercel's build step, which runs from the
repository root.

alembic.ini's own `script_location = %(here)s/alembic` is already
relative to the ini file, so pointing at it by absolute path is all that
is needed for the rest to follow.
"""

from pathlib import Path

from alembic.config import Config

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def alembic_config() -> Config:
    return Config(str(ALEMBIC_INI))
