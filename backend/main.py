import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.crud.db import init_db
from backend.external_services.flight import duffel_flight_service

from .routers import flights, users

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    await duffel_flight_service.aclose()


app = FastAPI(lifespan=lifespan)

# The frontend authenticates via an httpOnly cookie, so allow_credentials
# must be True for the browser to send/receive it cross-origin. Origins must
# be an explicit list (not "*") whenever allow_credentials is True.
_cors_origins = os.getenv("CORS_ORIGINS", "").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(users.router)
app.include_router(flights.router)


@app.get("/")
def hello():
    return {"message": "Flyt.io is live"}
