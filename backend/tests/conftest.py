"""Shared pytest fixtures - see api_client's docstring for why this must
be a single, session-scoped TestClient rather than one per test file.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.main import app


@pytest.fixture(scope="session")
def api_client():
    """A single TestClient, shared across the whole test session, used as
    a context manager so exactly one event loop/portal exists for the
    app's lifetime. fastapi-guard's async Redis client is a process-wide
    singleton whose connection binds to whichever event loop first uses
    it - a second, independent `with TestClient(app)` block elsewhere in
    the suite spins up its OWN event loop and breaks that binding
    ("Event loop is closed" / GuardRedisError on the first request made
    through it, confirmed empirically). Every test module that needs a
    TestClient must use this fixture instead of constructing its own.

    TestClient defaults to a fake ("testclient", 50000) client address,
    which fastapi-guard's IP-security check rejects outright (not a
    parseable IP) regardless of whitelist/blacklist config - a
    real-looking loopback address is given instead.
    """
    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        yield client


@pytest.fixture
def sqlite_engine():
    """A fresh in-memory SQLite engine with every table created - the
    standard fixture for tests that need a real DB round trip (FK
    constraints, session identity map) without depending on the app's
    configured Postgres/Docker Compose being up. StaticPool keeps one
    connection alive for the engine's lifetime, since a plain in-memory
    SQLite DB otherwise vanishes between connections."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine
