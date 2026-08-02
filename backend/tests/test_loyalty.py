"""Tests for the loyalty-programme-accounts PATCH endpoint
(crud/flights.py's update_offer_passenger_loyalty, routers/flights.py's
update_offer_passenger)."""

import asyncio

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.crud.flights import update_offer_passenger_loyalty
from backend.external_services.flight import duffel_flight_service
from backend.main import app
from backend.utils.pricing import MARKUP_RATE

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


def _override_get_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def db_client(api_client):
    app.dependency_overrides[get_session] = _override_get_session
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_session, None)


def _fake_priced_offer() -> dict:
    return {
        "data": {
            "id": "off_test123",
            "total_amount": "85.00",  # discounted after loyalty attached
            "total_currency": "USD",
        }
    }


def test_update_offer_passenger_loyalty_patches_then_repriced(monkeypatch):
    patch_calls = []

    async def fake_update_offer_passenger(offer_id, offer_passenger_id, update):
        patch_calls.append((offer_id, offer_passenger_id, update))
        return {"data": {}}

    async def fake_confirm_price(offer_id):
        assert offer_id == "off_test123"
        return _fake_priced_offer()

    monkeypatch.setattr(
        duffel_flight_service, "update_offer_passenger", fake_update_offer_passenger
    )
    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    result = asyncio.run(
        update_offer_passenger_loyalty(
            "off_test123",
            "pas_test123",
            {
                "given_name": "Amelia",
                "family_name": "Earhart",
                "loyalty_programme_accounts": [
                    {"airline_iata_code": "QF", "account_number": "12901014"}
                ],
            },
            MARKUP_RATE,
        )
    )

    assert patch_calls == [
        (
            "off_test123",
            "pas_test123",
            {
                "given_name": "Amelia",
                "family_name": "Earhart",
                "loyalty_programme_accounts": [
                    {"airline_iata_code": "QF", "account_number": "12901014"}
                ],
            },
        )
    ]
    # Marked up (7%) from the offer's discounted total, same as any other
    # confirm_price call - proves the re-fetch went through the shared
    # markup path, not a raw passthrough.
    assert result["data"]["total_amount"] == "90.95"


def test_update_offer_passenger_endpoint(db_client, monkeypatch):
    async def fake_update_offer_passenger(offer_id, offer_passenger_id, update):
        assert offer_id == "off_test123"
        assert offer_passenger_id == "pas_test123"
        return {"data": {}}

    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    monkeypatch.setattr(
        duffel_flight_service, "update_offer_passenger", fake_update_offer_passenger
    )
    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    response = db_client.patch(
        "/shopping/flight-offers/off_test123/passengers/pas_test123",
        json={
            "given_name": "Amelia",
            "family_name": "Earhart",
            "loyalty_programme_accounts": [
                {"airline_iata_code": "QF", "account_number": "12901014"}
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["total_amount"] == "90.95"
