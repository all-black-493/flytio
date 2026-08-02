"""Unit tests for checkout-time validation in crud/payments.py's
reconfirm_price_and_create_payment - specifically the passport-required
check, which must reject before any payment provider is ever contacted.

Uses an isolated in-memory SQLite engine, same pattern as test_payments.py.
"""

import asyncio
import uuid
from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.payments import reconfirm_price_and_create_payment
from backend.external_services.flight import duffel_flight_service
from backend.models.payments import PaymentProvider
from backend.schemas.duffel_orders import IdentityDocument, OrderPassenger
from backend.schemas.payments import CheckoutRequest

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _passenger(**overrides) -> OrderPassenger:
    defaults = dict(
        id="pas_test123",
        title="mr",
        gender="m",
        given_name="Test",
        family_name="Passenger",
        born_on=date(1990, 1, 1),
        email="test@example.com",
        phone_number="+254757573984",
    )
    defaults.update(overrides)
    return OrderPassenger(**defaults)


def _fake_priced_offer(identity_documents_required: bool) -> dict:
    return {
        "data": {
            "id": "off_test123",
            "total_amount": "93.46",
            "total_currency": "USD",
            "passenger_identity_documents_required": identity_documents_required,
        }
    }


def test_checkout_rejects_when_passport_required_but_missing(session, monkeypatch):
    async def fake_confirm_price(offer_id):
        return _fake_priced_offer(identity_documents_required=True)

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    request = CheckoutRequest(
        selected_offers=["off_test123"], passengers=[_passenger()]
    )
    user_id = uuid.uuid4()

    with pytest.raises(ValueError) as exc_info:
        asyncio.run(
            reconfirm_price_and_create_payment(
                session, user_id, request, PaymentProvider.PESAPAL
            )
        )

    assert "passport" in str(exc_info.value).lower()


def test_checkout_succeeds_when_passport_required_and_provided(session, monkeypatch):
    async def fake_confirm_price(offer_id):
        return _fake_priced_offer(identity_documents_required=True)

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    request = CheckoutRequest(
        selected_offers=["off_test123"],
        passengers=[
            _passenger(
                identity_documents=[
                    IdentityDocument(
                        unique_identifier="P1234567",
                        issuing_country_code="KE",
                        expires_on=date(2030, 1, 1),
                    )
                ]
            )
        ],
    )
    user_id = uuid.uuid4()

    payment = asyncio.run(
        reconfirm_price_and_create_payment(
            session, user_id, request, PaymentProvider.PESAPAL
        )
    )

    assert payment.amount == "100.00"  # marked up from the offer's "93.46"


def test_checkout_skips_passport_check_when_not_required(session, monkeypatch):
    async def fake_confirm_price(offer_id):
        return _fake_priced_offer(identity_documents_required=False)

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    request = CheckoutRequest(
        selected_offers=["off_test123"], passengers=[_passenger()]
    )
    user_id = uuid.uuid4()

    payment = asyncio.run(
        reconfirm_price_and_create_payment(
            session, user_id, request, PaymentProvider.PESAPAL
        )
    )

    assert payment.amount == "100.00"
