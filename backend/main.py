from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from guard import SecurityMiddleware
from sqlmodel import Session, text

from backend.config import settings
from backend.crud.db import get_session
from backend.external_services.flight import duffel_flight_service
from backend.external_services.payment import pesapal_payment_service
from backend.external_services.stay import duffel_stay_service
from backend.utils.guard import guard_deco, security_config
from backend.utils.kafka import kafka_producer
from backend.utils.log_manager import get_app_logger
from backend.routers import notifications

from .routers import (
    admin,
    bookings,
    concierge,
    flights,
    payments,
    stays,
    support,
    users,
    webhooks,
)

logger = get_app_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is now owned by Alembic migrations (see alembic/), run before
    # the app starts (compose.yaml's command) - not created/altered here.
    logger.info("flyt backend starting up")
    kafka_producer.start()
    yield
    kafka_producer.stop()
    await duffel_flight_service.aclose()
    await duffel_stay_service.aclose()
    await pesapal_payment_service.aclose()
    logger.info("flyt backend shutting down")


app = FastAPI(lifespan=lifespan)

# The frontend authenticates via an httpOnly cookie, so allow_credentials
# must be True for the browser to send/receive it cross-origin. Origins must
# be an explicit list (not "*") whenever allow_credentials is True.
_cors_origins = settings.CORS_ORIGINS.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.add_middleware(SecurityMiddleware, config=security_config)
# Required for guard_deco.rate_limit(...) route overrides (see routers/) to
# actually take effect - SecurityMiddleware reads route-specific config off
# this, not off the guard_deco instance directly.
app.state.guard_decorator = guard_deco

app.include_router(users.router)
app.include_router(flights.router)
app.include_router(bookings.router)
app.include_router(payments.router)
app.include_router(webhooks.router)
app.include_router(stays.router)
app.include_router(support.router)
app.include_router(admin.router)
app.include_router(concierge.router)
app.include_router(notifications.router)


@app.get("/")
def hello():
    return {"message": "Flyt is live"}


@app.get("/health")
def health(session: Session = Depends(get_session)):
    """Used by the frontend's navbar status ticker - a trivial DB round
    trip so "online" reflects real DB connectivity, not just that the
    FastAPI process is up."""
    session.exec(text("SELECT 1"))
    return {"status": "ok"}
