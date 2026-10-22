"""The guard agent needs a writable home, and says nothing when it lacks one.

guard_agent stores an install id under Path.home(). The mkdir that creates
its directory sits outside the try/except guarding the write, so a
read-only home raises through agent initialisation - which guard_core
catches and continues without the agent, while the startup log still says
the agent is enabled and reporting.
"""

import os
from pathlib import Path

import pytest

from backend.utils.guard import ensure_writable_home


@pytest.fixture
def home(monkeypatch):
    def _set(path):
        monkeypatch.setenv("HOME", str(path))

    return _set


def test_a_read_only_home_is_replaced(home, tmp_path):
    read_only = tmp_path / "ro"
    read_only.mkdir(mode=0o500)
    home(read_only)

    try:
        replaced = ensure_writable_home()
    finally:
        read_only.chmod(0o700)

    assert replaced is not None
    assert os.access(Path.home(), os.W_OK)


def test_a_writable_home_is_left_alone(home, tmp_path):
    """A normal host keeps its stable install id across restarts."""
    writable = tmp_path / "rw"
    writable.mkdir()
    home(writable)

    assert ensure_writable_home() is None
    assert Path.home() == writable


def test_the_agent_can_store_an_install_id_after_the_fix(home, tmp_path):
    """The end the fix exists for: this is what raised in production."""
    from guard_agent.install_id import resolve_install_id

    read_only = tmp_path / "ro"
    read_only.mkdir(mode=0o500)
    home(read_only)

    try:
        with pytest.raises(OSError):
            resolve_install_id()

        ensure_writable_home()
        install_id = resolve_install_id()
    finally:
        read_only.chmod(0o700)

    assert install_id
    assert resolve_install_id() == install_id
