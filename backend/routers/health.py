"""System health checks. Public and unauthenticated: nothing returned
here is more sensitive than "is this dependency reachable right now".

Three endpoints, because an orchestrator asks two different questions and
a human asks a third:

- GET /health/live  - "is this process wedged?" Answers from the process
  alone, touching no dependency. Kubernetes RESTARTS the container when
  this fails, so involving the database here would turn one slow query
  into a cluster-wide restart loop: every replica killed, none able to
  start faster than the database recovers.
- GET /health/ready - "should traffic go here?" Checks the dependencies a
  request actually needs. Failing only removes the pod from the Service's
  endpoints; it comes back on its own when the dependency does.
- GET /health      - the full report, for the frontend's status ticker
  (StatusTicker.tsx) and external uptime monitors, which want the detail
  rather than a bare pass/fail.

All three share the same check functions - the split is about what
failure means, not about how anything is measured.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session, text

from backend.crud.db import get_session
from backend.utils.constants import HEALTH_PREFIX
from backend.external_services.cache import redis_cache
from backend.schemas.health import HealthResponse, ServiceHealth
from backend.utils.kafka import kafka_producer
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

router = APIRouter(prefix=HEALTH_PREFIX, tags=["Health"])


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


def _overall_status(services: dict[str, ServiceHealth]) -> str:
    """One rule for "healthy / degraded / down", shared by every endpoint
    below so they can never disagree about what the same set of checks
    means. "not_configured" is excluded rather than counted as a failure -
    a dependency this environment deliberately doesn't have (see
    _check_kafka) is not an outage."""
    checked = [s for s in services.values() if s.status != "not_configured"]
    unhealthy = [s for s in checked if s.status == "unhealthy"]
    if not unhealthy:
        return "healthy"
    return "down" if len(unhealthy) == len(checked) else "degraded"


@router.get("/live")
def liveness():
    """Deliberately checks nothing. Reaching this handler already proves
    what liveness asks: the process is up, the event loop is turning and
    routing works. Anything more would risk restarting a healthy container
    over an unhealthy dependency."""
    return {"status": "alive"}


@router.get("/ready", response_model=HealthResponse)
def readiness(response: Response, session: Session = Depends(get_session)):
    """Returns 503 when a dependency a request needs is down, so the
    orchestrator can stop routing to this instance. The body is the same
    shape as GET /health, so anything already parsing that keeps working.

    Kafka is excluded on purpose: the API publishes events fire-and-forget
    (utils/kafka.py) and serves every read and write without a broker, so
    a Kafka outage must not take the whole API out of rotation."""
    services = {
        "database": _check_database(session),
        "redis": _check_redis(),
    }
    overall = _overall_status(services)
    if overall != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status=overall, checked_at=datetime.now(UTC), services=services
    )


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

    return HealthResponse(
        status=_overall_status(services),
        checked_at=datetime.now(UTC),
        services=services,
    )
