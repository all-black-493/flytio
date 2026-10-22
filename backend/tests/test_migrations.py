"""Schema changes belong to the deploy, not to a request.

A function is the app, so a migration triggered by a request would run
concurrently across however many instances cold start together. The
entrypoints under backend/scripts/ are the only place that may do it.
"""

import os
import re
from pathlib import Path

from alembic.script import ScriptDirectory

from backend.scripts.alembic_config import ALEMBIC_INI, alembic_config

BACKEND = Path(__file__).resolve().parents[1]

# Where a request can reach. scripts/ holds the deliberate entrypoints and
# alembic/ holds the migrations themselves, so neither is in scope. Dotted
# directories are skipped so this never walks into .venv, whose SQLAlchemy
# ships the very call being looked for.
EXCLUDED = {"scripts", "alembic", "tests"}

SCHEMA_CALLS = re.compile(
    r"\b(metadata\.create_all|command\.(upgrade|stamp|downgrade))\b"
)


def _application_sources() -> list[Path]:
    return [
        path
        for path in BACKEND.rglob("*.py")
        if not EXCLUDED & set(parts := set(path.relative_to(BACKEND).parts))
        and not any(part.startswith(".") for part in parts)
    ]


def test_alembic_config_does_not_depend_on_the_working_directory(tmp_path):
    """It used to be Config("alembic.ini"), which only resolved from backend/.

    Vercel's build step runs from the repository root.
    """
    original = os.getcwd()
    os.chdir(tmp_path)
    try:
        assert ALEMBIC_INI.exists()
        script_dir = ScriptDirectory.from_config(alembic_config())
        assert Path(script_dir.dir) == BACKEND / "alembic"
        assert script_dir.get_current_head()
    finally:
        os.chdir(original)


def test_no_application_module_changes_the_schema():
    offenders = {
        str(path.relative_to(BACKEND)): match.group(0)
        for path in _application_sources()
        if (match := SCHEMA_CALLS.search(path.read_text()))
    }
    assert not offenders, f"schema changes outside backend/scripts/: {offenders}"
