"""Schemas shared across multiple routers - kept dependency-free (plain
pydantic BaseModel) so it can be embedded in both the Pydantic-based Duffel
schemas (duffel_flights.py, duffel_orders.py, duffel_places.py,
duffel_stays.py) and the SQLModel-based booking schemas (bookings.py)
without either importing the other's base class.
"""

from datetime import date
from typing import Any, get_origin

from pydantic import BaseModel, ConfigDict, model_validator


class PaginationMeta(BaseModel):
    """Offset pagination, now used only by flight search.

    Every DB-backed list moved to cursor pagination (fastapi-pagination's
    CursorPage) because OFFSET makes the database walk and discard every
    row it skips, so deep pages get steadily slower as data grows. Flight
    search deliberately stays here: it pages a Redis-cached Duffel result
    already held in memory (utils/offer_filtering.py slices a Python
    list), so there is no row-skipping to avoid, and its UI shows a
    result count and lets you jump around - neither of which cursor
    pagination gives you.
    """

    limit: int
    offset: int
    total: int
    has_more: bool


class BaseSchema(BaseModel):
    """Base for every Duffel-wire-format schema - `extra="ignore"` since
    Duffel's responses carry many fields we don't model, and this is a
    pass-through/subset mapping, not a strict contract."""

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _coerce_none_collections(cls, data: Any) -> Any:
        """Duffel sends an explicit `null` for some empty list/dict
        fields, not just an omitted key - confirmed the hard way for
        Offer.available_services, which crashed every single search
        until this was found (a plain `= []` default only covers a
        missing key, never an explicit None). Applied once here, to
        every list/dict-typed field on every subclass, rather than
        chasing this down field-by-field as each one happens to be the
        next to receive a real `null` from Duffel."""
        if not isinstance(data, dict):
            return data
        for name, field in cls.model_fields.items():
            key = field.alias or name
            if key not in data or data[key] is not None:
                continue
            origin = get_origin(field.annotation)
            if field.annotation is list or origin is list:
                data[key] = []
            elif field.annotation is dict or origin is dict:
                data[key] = {}
        return data


def not_in_past(value: date) -> date:
    if value < date.today():
        raise ValueError("Date cannot be in the past")
    return value


def not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("Date cannot be in the future")
    return value
