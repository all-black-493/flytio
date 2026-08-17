"""Tests for the Duffel Cars foundation (routers/cars.py,
schemas/duffel_cars.py) - request validation plus a router smoke test per
endpoint with the Duffel call mocked, matching tests/test_stays.py.

The validation tests are the ones that earn their keep: they cover the
mistakes a date/time picker actually produces, and each one would
otherwise surface as a generic Duffel 422 that tells a traveller nothing.
"""

import pytest

from backend.external_services.car import DuffelAPIError, duffel_car_service
from backend.schemas.duffel_cars import CarsBookingRequest, CarsSearchRequest


def _search_payload(**overrides) -> dict:
    payload = {
        "pick_up_location": "NBO",
        "pick_up_date": "2026-09-04",
        "pick_up_time": "10:00",
        "drop_off_date": "2026-09-07",
        "drop_off_time": "18:00",
    }
    payload.update(overrides)
    return payload


# --- request validation --------------------------------------------------


def test_search_request_accepts_the_documented_minimum():
    """Four required fields; drop_off_location and driver_age are optional
    per Duffel's parameter list."""
    request = CarsSearchRequest(**_search_payload())
    assert request.pick_up_location == "NBO"
    assert request.drop_off_location is None
    assert request.driver_age is None


def test_optional_fields_are_omitted_not_nulled():
    """Duffel treats an absent field and an explicit null differently;
    sending null for drop_off_location would not mean "same as pick-up"."""
    body = CarsSearchRequest(**_search_payload()).to_duffel()
    assert "drop_off_location" not in body
    assert "driver_age" not in body


def test_one_way_hire_keeps_a_distinct_drop_off():
    body = CarsSearchRequest(**_search_payload(drop_off_location="MBA")).to_duffel()
    assert body["drop_off_location"] == "MBA"


def test_rejects_drop_off_before_pick_up():
    with pytest.raises(ValueError):
        CarsSearchRequest(
            **_search_payload(pick_up_date="2026-09-07", drop_off_date="2026-09-04")
        )


def test_rejects_same_day_hire_ending_before_it_starts():
    """The case a date-only check misses: same day, reversed times."""
    with pytest.raises(ValueError):
        CarsSearchRequest(
            **_search_payload(
                pick_up_date="2026-09-04",
                drop_off_date="2026-09-04",
                pick_up_time="18:00",
                drop_off_time="10:00",
            )
        )


def test_allows_same_day_hire_when_the_times_run_forwards():
    request = CarsSearchRequest(
        **_search_payload(
            pick_up_date="2026-09-04",
            drop_off_date="2026-09-04",
            pick_up_time="09:00",
            drop_off_time="17:30",
        )
    )
    assert request.drop_off_time == "17:30"


@pytest.mark.parametrize("bad_time", ["9:00", "24:00", "10:60", "1000", "10:00:00"])
def test_rejects_malformed_times(bad_time):
    """Duffel wants HH:mm. Anything else is a 422 from them with no
    indication of which field was wrong."""
    with pytest.raises(ValueError):
        CarsSearchRequest(**_search_payload(pick_up_time=bad_time))


@pytest.mark.parametrize("age", [17, 100])
def test_rejects_implausible_driver_ages(age):
    with pytest.raises(ValueError):
        CarsSearchRequest(**_search_payload(driver_age=age))


def test_booking_request_requires_a_real_email():
    """The renter's address is where the supplier's confirmation goes -
    a typo here means the traveller arrives at a desk with nothing."""
    with pytest.raises(ValueError):
        CarsBookingRequest(quote_id="quo_123", renter_email="not-an-email")


def test_booking_request_carries_both_documented_fields():
    body = CarsBookingRequest(
        quote_id="quo_123", renter_email="renter@example.com"
    ).to_duffel()
    assert body == {"quote_id": "quo_123", "renter_email": "renter@example.com"}


# --- router smoke tests --------------------------------------------------


def test_search_endpoint_returns_duffels_response(api_client, monkeypatch):
    async def fake_search(search):
        assert search["pick_up_location"] == "NBO"
        return {"data": [{"id": "quo_1"}]}

    monkeypatch.setattr(duffel_car_service, "search_cars", fake_search)
    response = api_client.post("/api/v1/cars/search", json=_search_payload())
    assert response.status_code == 200
    assert response.json()["data"][0]["id"] == "quo_1"


def test_quote_endpoint_reads_one_quote(api_client, monkeypatch):
    async def fake_quote(quote_id):
        assert quote_id == "quo_1"
        return {"data": {"id": "quo_1", "total_amount": "84.00"}}

    monkeypatch.setattr(duffel_car_service, "get_quote", fake_quote)
    response = api_client.get("/api/v1/cars/quotes/quo_1")
    assert response.status_code == 200
    assert response.json()["data"]["total_amount"] == "84.00"


def test_booking_endpoint_returns_201(api_client, monkeypatch):
    async def fake_booking(booking):
        assert booking["quote_id"] == "quo_1"
        return {"data": {"id": "car_1"}}

    monkeypatch.setattr(duffel_car_service, "create_booking", fake_booking)
    response = api_client.post(
        "/api/v1/cars/bookings",
        json={"quote_id": "quo_1", "renter_email": "renter@example.com"},
    )
    assert response.status_code == 201


def test_duffel_errors_become_http_errors_not_500s(api_client, monkeypatch):
    """A supplier rejecting a search is a client-visible outcome, not an
    internal fault - the shared mapper (utils/duffel_errors.py) is what
    keeps that true for every product surface."""

    async def fake_search(search):
        raise DuffelAPIError(422, [{"message": "invalid location"}])

    monkeypatch.setattr(duffel_car_service, "search_cars", fake_search)
    response = api_client.post("/api/v1/cars/search", json=_search_payload())
    assert response.status_code == 422
    assert "invalid location" in response.text


def test_cars_and_stays_raise_the_same_error_class():
    """One DuffelAPIError across every product, not one per module. A
    package flow touching two products would otherwise need to catch two
    near-identical classes, and catching the wrong one fails as a 500."""
    from backend.external_services.flight import DuffelAPIError as FlightError
    from backend.external_services.stay import DuffelAPIError as StayError

    assert DuffelAPIError is FlightError is StayError
