"""Router-level tests for GET /health (routers/health.py) - the shared
api_client fixture (conftest.py) with get_session overridden to an
in-memory SQLite DB, and redis_cache's underlying client swapped for a
fake via monkeypatch so no real Redis connectivity is needed to exercise
the aggregation logic itself."""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
import backend.routers.health as health_module
from backend.crud.db import get_session
from backend.main import app
from backend.schemas.health import ServiceHealth

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


def _override_get_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def db_client(api_client):
    app.dependency_overrides[get_session] = _override_get_session
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_session, None)


class _FakeRedis:
    def __init__(self, raises: bool = False):
        self.raises = raises

    def ping(self):
        if self.raises:
            raise ConnectionError("redis unreachable")
        return True


def test_health_check_all_healthy(db_client, monkeypatch):
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis())

    response = db_client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["services"]["database"] == {"status": "healthy", "detail": None}
    assert body["services"]["redis"] == {"status": "healthy", "detail": None}


def test_health_check_one_service_down_is_degraded_not_down(db_client, monkeypatch):
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis(raises=True))

    response = db_client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["services"]["redis"]["status"] == "unhealthy"
    assert body["services"]["database"]["status"] == "healthy"


def test_health_check_redis_down_is_still_degraded(db_client, monkeypatch):
    """Database - the one service still healthy - keeps this from being
    "down": down means every *checked* service failed, not just most."""
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis(raises=True))

    response = db_client.get("/health")

    body = response.json()
    assert body["status"] == "degraded"
    assert body["services"]["database"]["status"] == "healthy"


def test_health_check_every_checked_service_down_is_down(db_client, monkeypatch):
    monkeypatch.setattr(
        health_module,
        "_check_database",
        lambda session: ServiceHealth(status="unhealthy"),
    )
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis(raises=True))

    response = db_client.get("/health")

    body = response.json()
    assert body["status"] == "down"


def test_not_configured_is_not_counted_as_a_failure():
    """The rule used to be exercised through Kafka, which was legitimately
    absent in some environments. Nothing reports not_configured now that the
    broker is gone, so the rule is pinned directly rather than left to rot:
    a dependency this environment deliberately lacks is not an outage."""
    assert (
        health_module._overall_status(
            {
                "database": ServiceHealth(status="healthy"),
                "absent": ServiceHealth(status="not_configured"),
            }
        )
        == "healthy"
    )


def test_down_means_every_checked_service_failed():
    assert (
        health_module._overall_status(
            {
                "database": ServiceHealth(status="unhealthy"),
                "absent": ServiceHealth(status="not_configured"),
            }
        )
        == "down"
    )
