from fastapi import FastAPI
from .routers import users, flights
from backend.crud.db import init_db

app = FastAPI()


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(users.router)
app.include_router(flights.router)


@app.get("/")
def hello():
    return {"message": "Flyt.io is live"}
