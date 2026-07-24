"""Schemas shared across multiple routers - kept dependency-free (plain
pydantic BaseModel) so it can be embedded in both the Pydantic-based Duffel
schemas (duffel_flights.py) and the SQLModel-based booking schemas
(bookings.py) without either importing the other's base class.
"""

from pydantic import BaseModel


class PaginationMeta(BaseModel):
    limit: int
    offset: int
    total: int
    has_more: bool
