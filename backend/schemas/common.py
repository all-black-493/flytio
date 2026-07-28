"""Schemas shared across multiple routers - kept dependency-free (plain
pydantic BaseModel) so it can be embedded in both the Pydantic-based Duffel
schemas (duffel_flights.py, duffel_orders.py, duffel_places.py,
duffel_stays.py) and the SQLModel-based booking schemas (bookings.py)
without either importing the other's base class.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict


class PaginationMeta(BaseModel):
    limit: int
    offset: int
    total: int
    has_more: bool


class BaseSchema(BaseModel):
    """Base for every Duffel-wire-format schema - `extra="ignore"` since
    Duffel's responses carry many fields we don't model, and this is a
    pass-through/subset mapping, not a strict contract."""

    model_config = ConfigDict(extra="ignore")


def not_in_past(value: date) -> date:
    if value < date.today():
        raise ValueError("Date cannot be in the past")
    return value


def not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("Date cannot be in the future")
    return value
