"""System health check - GET /health, used by the frontend's navbar
status ticker (StatusTicker.tsx) and available for any external uptime
monitor. Public, unauthenticated: nothing returned here is more
sensitive than "is this dependency reachable right now"."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlmodel import Session, text

from backend.crud.db import get_session
from backend.external_services.cache import redis_cache
from backend.schemas.health import HealthResponse, ServiceHealth
from backend.utils.kafka import kafka_producer
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

router = APIRouter(prefix="/health")


def _check_database(session: Session) -> ServiceHealth:
    try:
        session.exec(text("SELECT 1"))
        return ServiceHealth(status="healthy")
    except Exception as e:
        logger.warning("Health check: database unreachable: %s", e)
        return ServiceHealth(status="unhealthy")


def _check_redis() -> ServiceHealth:
    try:
        redis_cache.r.ping()
        return ServiceHealth(status="healthy")
    except Exception as e:
        logger.warning("Health check: redis unreachable: %s", e)
        return ServiceHealth(status="unhealthy")


def _check_kafka() -> ServiceHealth:
    # None means the producer was never successfully started - either
    # KAFKA_BOOTSTRAP_SERVERS isn't set in this environment (an
    # intentionally supported state, see config.py) or the broker was
    # unreachable at startup. Either way, list_topics() would just raise
    # AttributeError on None - this is the same outcome reported more
    # precisely.
    if kafka_producer.producer is None:
        return ServiceHealth(status="not_configured")
    try:
        metadata = kafka_producer.producer.list_topics(timeout=1)
        if not metadata.brokers:
            return ServiceHealth(status="unhealthy", detail="no brokers")
        return ServiceHealth(status="healthy")
    except Exception as e:
        logger.warning("Health check: kafka unreachable: %s", e)
        return ServiceHealth(status="unhealthy")


@router.get("", response_model=HealthResponse)
def health_check(session: Session = Depends(get_session)):
    """A plain `def`, not `async def` - every check below is a blocking
    synchronous client call (SQLModel's Session, redis-py, confluent-
    kafka's Producer all block the caller). FastAPI runs a sync route
    handler in its own threadpool automatically; wrapping the same
    blocking calls in `async def` would instead stall the event loop for
    every other in-flight request each time this one polls its
    dependencies."""
    services = {
        "database": _check_database(session),
        "redis": _check_redis(),
        "kafka": _check_kafka(),
    }

    checked = [s for s in services.values() if s.status != "not_configured"]
    unhealthy = [s for s in checked if s.status == "unhealthy"]

    if not unhealthy:
        overall = "healthy"
    elif len(unhealthy) == len(checked):
        overall = "down"
    else:
        overall = "degraded"

    return HealthResponse(
        status=overall, checked_at=datetime.now(UTC), services=services
    )
