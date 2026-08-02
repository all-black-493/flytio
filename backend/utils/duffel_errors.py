"""Shared HTTP-mapping for Duffel API errors - used by every router that
calls a Duffel service (flights, bookings, stays). Takes the error's
status_code/errors rather than a specific exception type, since two
near-identical DuffelAPIError classes exist by design
(external_services/flight.py, external_services/stay.py each stay
dependency-free of the other's product surface).
"""

from typing import Protocol

from fastapi import HTTPException, status


class DuffelErrorLike(Protocol):
    status_code: int
    errors: list[dict]


def duffel_http_exception(error: DuffelErrorLike) -> HTTPException:
    """Maps a Duffel error to an HTTP response: client errors (4xx) pass
    through as-is, anything else is reported as a bad gateway (502) since
    it's an upstream failure, not the caller's fault."""
    mapped_status = (
        error.status_code
        if 400 <= error.status_code < 500
        else status.HTTP_502_BAD_GATEWAY
    )
    return HTTPException(status_code=mapped_status, detail=error.errors or str(error))
