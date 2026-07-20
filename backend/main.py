from contextlib import asynccontextmanager

from fastapi import FastAPI
from .routers import users, flights
from backend.crud.db import init_db
from backend.external_services.flight import duffel_flight_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    await duffel_flight_service.aclose()


app = FastAPI(lifespan=lifespan)

app.include_router(users.router)
app.include_router(flights.router)


@app.get("/")
def hello():
    return {"message": "Flyt.io is live"}
