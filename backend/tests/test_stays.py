"""Tests for the Duffel Stays foundation (routers/stays.py,
schemas/duffel_stays.py) - request validation plus a router smoke test
per endpoint with the Duffel call itself mocked (no real Duffel Stays
sandbox connectivity assumed)."""

import pytest

from backend.utils.security import get_current_user

from backend.models.users import UserInDB

from backend.main import app

from backend.external_services.stay import DuffelAPIError, duffel_stay_service
from backend.schemas.duffel_stays import StaysSearchRequest


@pytest.fixture
def authed_client(api_client):
    """A client whose requests carry an authenticated user.

    get_current_user is overridden rather than a real token minted against
    a real row: what these tests exercise is the Duffel pass-through, and
    the authentication itself is covered where it belongs
    (tests/test_account_management.py). The property that the endpoint
    REQUIRES a user is asserted separately below, against the plain
    client - overriding it here would otherwise hide exactly the gap this
    dependency was added to close.
    """
    app.dependency_overrides[get_current_user] = lambda: UserInDB(
        email="renter@example.com", password="hashed"
    )
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def _search_payload(**overrides) -> dict:
    payload = {
        "rooms": 1,
        "check_in_date": "2026-09-04",
        "check_out_date": "2026-09-07",
        "guests": [{"type": "adult"}],
        "location": {
            "radius": 2,
            "geographic_coordinates": {"latitude": -24.38, "longitude": -128.32},
        },
    }
    payload.update(overrides)
    return payload


def test_stays_search_request_accepts_a_valid_payload():
    request = StaysSearchRequest(**_search_payload())
    assert request.rooms == 1
    assert request.location.geographic_coordinates.latitude == -24.38


def test_stays_search_request_rejects_check_out_before_check_in():
    with pytest.raises(ValueError):
        StaysSearchRequest(
            **_search_payload(check_in_date="2026-09-07", check_out_date="2026-09-04")
        )


def test_stays_search_request_rejects_equal_dates():
    with pytest.raises(ValueError):
        StaysSearchRequest(
            **_search_payload(check_in_date="2026-09-04", check_out_date="2026-09-04")
        )


def test_search_stays_endpoint_returns_duffels_raw_response(api_client, monkeypatch):
    fake_response = {
        "data": [{"id": "sre_test123", "accommodation": {"name": "Test Hotel"}}]
    }

    async def fake_search_stays(search):
        assert search["rooms"] == 1
        return fake_response

    monkeypatch.setattr(duffel_stay_service, "search_stays", fake_search_stays)

    response = api_client.post("/api/v1/stays/search", json=_search_payload())

    assert response.status_code == 200
    assert response.json() == fake_response


def test_search_stays_endpoint_maps_duffel_client_error_to_matching_status(
    api_client, monkeypatch
):
    async def fake_search_stays(search):
        raise DuffelAPIError(422, [{"message": "invalid location"}])

    monkeypatch.setattr(duffel_stay_service, "search_stays", fake_search_stays)

    response = api_client.post("/api/v1/stays/search", json=_search_payload())

    assert response.status_code == 422


def test_fetch_stay_rates_endpoint(api_client, monkeypatch):
    fake_response = {
        "data": {"rates": [{"id": "rat_test123", "total_amount": "150.00"}]}
    }

    async def fake_fetch_rates(search_result_id):
        assert search_result_id == "sre_test123"
        return fake_response

    monkeypatch.setattr(duffel_stay_service, "fetch_rates", fake_fetch_rates)

    response = api_client.post("/api/v1/stays/search-results/sre_test123/rates")

    assert response.status_code == 200
    assert response.json() == fake_response


def test_create_stay_quote_endpoint(api_client, monkeypatch):
    fake_response = {"data": {"id": "stq_test123", "total_amount": "150.00"}}

    async def fake_create_quote(rate_id):
        assert rate_id == "rat_test123"
        return fake_response

    monkeypatch.setattr(duffel_stay_service, "create_quote", fake_create_quote)

    response = api_client.post("/api/v1/stays/quotes", json={"rate_id": "rat_test123"})

    assert response.status_code == 200
    assert response.json() == fake_response


def test_create_stay_booking_endpoint(authed_client, monkeypatch):
    fake_response = {"data": {"id": "sbk_test123", "reference": "XYZ789"}}

    async def fake_create_booking(booking):
        assert booking["quote_id"] == "stq_test123"
        assert booking["guests"][0]["given_name"] == "Amelia"
        return fake_response

    monkeypatch.setattr(duffel_stay_service, "create_booking", fake_create_booking)

    response = authed_client.post(
        "/api/v1/stays/bookings",
        json={
            "quote_id": "stq_test123",
            "email": "amelia.earhart@duffel.com",
            "phone_number": "+442080160509",
            "guests": [
                {
                    "given_name": "Amelia",
                    "family_name": "Earhart",
                    "born_on": "1987-07-24",
                }
            ],
        },
    )

    assert response.status_code == 201
    assert response.json() == fake_response


def test_create_stay_booking_requires_authentication(api_client, monkeypatch):
    """The step that spends money needs an owner.

    Search and quote are deliberately public, as they are for flights.
    Booking is not: it draws on flyt's own Duffel balance and creates a
    real reservation with a supplier.

    The tripwire is the point. Asserting 401 alone passed even with the
    dependency removed: the unmocked Duffel call was itself rejected for
    a bad token and the error mapper turned that into a 401 - the right
    status for the wrong reason. Failing if the supplier is reached at
    all is what actually pins this open.
    """

    async def must_not_be_called(*args, **kwargs):
        raise AssertionError(
            "reached Duffel with no authenticated user - the booking "
            "endpoint is no longer gated"
        )

    monkeypatch.setattr(duffel_stay_service, "create_booking", must_not_be_called)

    response = api_client.post("/api/v1/stays/bookings", json={})
    assert response.status_code == 401
