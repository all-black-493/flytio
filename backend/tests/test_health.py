"""Router-level tests for GET /health (routers/health.py) - the shared
api_client fixture (conftest.py) with get_session overridden to an
in-memory SQLite DB, and redis_cache/kafka_producer's underlying
clients swapped for fakes via monkeypatch so no real Redis/Kafka
connectivity is needed to exercise the aggregation logic itself."""

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


class _FakeMetadata:
    def __init__(self, brokers):
        self.brokers = brokers


class _FakeKafkaProducer:
    def __init__(self, *, raises: bool = False, brokers: dict | None = None):
        self.raises = raises
        self.brokers = brokers if brokers is not None else {1: object()}

    def list_topics(self, timeout):
        if self.raises:
            raise Exception("kafka unreachable")
        return _FakeMetadata(self.brokers)


def test_health_check_all_healthy(db_client, monkeypatch):
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis())
    monkeypatch.setattr(health_module.kafka_producer, "producer", _FakeKafkaProducer())

    response = db_client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["services"]["database"] == {"status": "healthy", "detail": None}
    assert body["services"]["redis"] == {"status": "healthy", "detail": None}
    assert body["services"]["kafka"] == {"status": "healthy", "detail": None}


def test_health_check_kafka_not_configured_does_not_degrade(db_client, monkeypatch):
    """Kafka being unconfigured (producer is None - see config.py's own
    comment on KAFKA_BOOTSTRAP_SERVERS's empty default) is an expected
    state in some environments, not a degradation."""
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis())
    monkeypatch.setattr(health_module.kafka_producer, "producer", None)

    response = db_client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["services"]["kafka"]["status"] == "not_configured"


def test_health_check_one_service_down_is_degraded_not_down(db_client, monkeypatch):
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis(raises=True))
    monkeypatch.setattr(health_module.kafka_producer, "producer", _FakeKafkaProducer())

    response = db_client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["services"]["redis"]["status"] == "unhealthy"
    assert body["services"]["database"]["status"] == "healthy"


def test_health_check_kafka_no_brokers_is_unhealthy(db_client, monkeypatch):
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis())
    monkeypatch.setattr(
        health_module.kafka_producer,
        "producer",
        _FakeKafkaProducer(brokers={}),
    )

    response = db_client.get("/health")

    body = response.json()
    assert body["services"]["kafka"] == {"status": "unhealthy", "detail": "no brokers"}
    assert body["status"] == "degraded"


def test_health_check_redis_and_kafka_down_is_still_degraded(db_client, monkeypatch):
    """Database - the one service still healthy - keeps this from being
    "down": down means every *checked* service failed, not just most."""
    monkeypatch.setattr(health_module.redis_cache, "r", _FakeRedis(raises=True))
    monkeypatch.setattr(
        health_module.kafka_producer, "producer", _FakeKafkaProducer(raises=True)
    )

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
    # not_configured, not unhealthy - must not count toward "checked".
    monkeypatch.setattr(health_module.kafka_producer, "producer", None)

    response = db_client.get("/health")

    body = response.json()
    assert body["status"] == "down"
    assert body["services"]["kafka"]["status"] == "not_configured"
