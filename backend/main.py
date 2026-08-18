from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from guard import SecurityMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from backend.config import settings
from backend.utils.constants import API_V1_PREFIX
from backend.external_services.flight import duffel_flight_service
from backend.external_services.google_oauth import google_oauth_service
from backend.external_services.payment import pesapal_payment_service
from backend.external_services.car import duffel_car_service
from backend.external_services.stay import duffel_stay_service
from backend.utils.guard import guard_deco, security_config
from backend.utils.kafka import kafka_producer
from backend.utils.log_manager import get_app_logger
from backend.routers import notifications

from .routers import (
    admin,
    bookings,
    cars,
    concierge,
    flights,
    health,
    oauth,
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
    await duffel_car_service.aclose()
    await pesapal_payment_service.aclose()
    await google_oauth_service.aclose()
    logger.info("flyt backend shutting down")


app = FastAPI(lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

# The frontend authenticates via an httpOnly cookie, so allow_credentials
# must be True for the browser to send/receive it cross-origin. Origins must
# be an explicit list (not "*") whenever allow_credentials is True.
#
# Entries are stripped, because CORS matching is exact string equality: a
# CORS_ORIGINS of "https://a.com, https://b.com" - written the way anyone
# naturally writes a list - yields " https://b.com" with a leading space,
# which silently matches no browser Origin ever. The failure surfaces only
# in a browser, as "CORS Missing Allow Origin", with the server otherwise
# healthy and curl (which sends no Origin) perfectly happy.
_cors_origins = [
    origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()
]

# Announced at startup because an empty or wrong CORS_ORIGINS is invisible
# from the server's side: every health check passes, curl is happy (it
# sends no Origin), and only a browser ever sees "CORS Missing Allow
# Origin". Having bitten twice - once from a stray leading space, once
# from the variable simply not being set in the new secrets store - the
# resolved list is now in the logs, where it can be checked without a
# browser.
if _cors_origins:
    logger.info("CORS allows %d origin(s): %s", len(_cors_origins), _cors_origins)
else:
    logger.error(
        "CORS_ORIGINS is empty - EVERY cross-origin browser request will be "
        "refused, while the API itself stays healthy. Set it to the "
        "frontend's exact scheme+host, e.g. https://www.flyt.africa"
    )

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

api_v1_router = APIRouter(prefix=API_V1_PREFIX)

api_v1_router.include_router(users.router, tags=["Auth"])
api_v1_router.include_router(flights.router)
api_v1_router.include_router(bookings.router)
api_v1_router.include_router(payments.router)
api_v1_router.include_router(webhooks.router)
api_v1_router.include_router(stays.router)
api_v1_router.include_router(cars.router)
api_v1_router.include_router(support.router)
api_v1_router.include_router(admin.router)
api_v1_router.include_router(concierge.router)
api_v1_router.include_router(notifications.router)
api_v1_router.include_router(health.router)
api_v1_router.include_router(oauth.router)

app.include_router(api_v1_router)

# Unversioned alias for the liveness/readiness probe. Load balancers,
# uptime monitors and container orchestrators are configured with a URL
# once and are not going to follow /api/v2 later - the whole point of
# versioning the API is that the contract can change, and this endpoint's
# contract must not. Serving it at both paths keeps existing probes
# working while /api/v1/health stays available to the frontend.
app.include_router(health.router)


@app.get("/")
def hello():
    return {"message": "Flyt is live"}
