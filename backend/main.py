from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, text

from backend.config import settings
from backend.crud.db import get_session, init_db
from backend.external_services.flight import duffel_flight_service
from backend.external_services.payment import pesapal_payment_service

from .routers import flights, payments, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    await duffel_flight_service.aclose()
    await pesapal_payment_service.aclose()


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

app.include_router(users.router)
app.include_router(flights.router)
app.include_router(payments.router)


@app.get("/")
def hello():
    return {"message": "Flyt.io is live"}


@app.get("/health")
def health(session: Session = Depends(get_session)):
    """Used by the frontend's navbar status ticker - a trivial DB round
    trip so "online" reflects real DB connectivity, not just that the
    FastAPI process is up."""
    session.exec(text("SELECT 1"))
    return {"status": "ok"}
