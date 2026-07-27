"""Unit tests for the date-range validation added to schemas/duffel_flights.py -
previously a future date of birth, a past departure date, and a return
date before the departure date were all silently accepted and only
surfaced as an opaque Duffel error, if at all."""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from backend.schemas.duffel_flights import (
    FlightSearchQueryParams,
    OrderPassenger,
    SlicePlan,
)

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)


def _passenger(**overrides):
    fields = dict(
        id="pas_test",
        title="mr",
        gender="m",
        given_name="Test",
        family_name="Passenger",
        born_on=date(1990, 1, 1),
        email="test@example.com",
        phone_number="+254757573984",
    )
    fields.update(overrides)
    return OrderPassenger(**fields)


def test_slice_plan_rejects_past_departure_date():
    with pytest.raises(ValidationError):
        SlicePlan(origin="NBO", destination="DXB", departure_date=YESTERDAY)


def test_slice_plan_accepts_today():
    SlicePlan(origin="NBO", destination="DXB", departure_date=TODAY)


def test_flight_search_query_params_rejects_past_departure_date():
    with pytest.raises(ValidationError):
        FlightSearchQueryParams(
            origin="NBO", destination="DXB", departure_date=YESTERDAY
        )


def test_flight_search_query_params_rejects_return_before_departure():
    with pytest.raises(ValidationError):
        FlightSearchQueryParams(
            origin="NBO",
            destination="DXB",
            departure_date=TODAY + timedelta(days=5),
            return_date=TODAY + timedelta(days=1),
        )


def test_flight_search_query_params_accepts_return_after_departure():
    params = FlightSearchQueryParams(
        origin="NBO",
        destination="DXB",
        departure_date=TODAY,
        return_date=TODAY + timedelta(days=1),
    )
    assert params.return_date == TODAY + timedelta(days=1)


def test_order_passenger_rejects_future_born_on():
    with pytest.raises(ValidationError):
        _passenger(born_on=TOMORROW)


def test_order_passenger_accepts_past_born_on():
    passenger = _passenger(born_on=date(1990, 1, 1))
    assert passenger.born_on == date(1990, 1, 1)


def test_order_passenger_accepts_born_on_today():
    passenger = _passenger(born_on=TODAY)
    assert passenger.born_on == TODAY
