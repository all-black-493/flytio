"""Router-level tests for Duffel's order-change flow
(routers/bookings.py's create_order_change_request/list_order_change_offers/
create_order_change/confirm_order_change), using the shared api_client
fixture (conftest.py) with an in-memory SQLite DB - same pattern as
test_webhooks.py.
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.external_services.flight import duffel_flight_service
from backend.main import app
from backend.models.bookings import Booking, BookingStatus
from backend.models.users import UserInDB
from backend.utils.security import create_access_token

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


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _make_booking_and_auth(session: Session) -> tuple[Booking, dict]:
    user = UserInDB(email="traveler@example.com", password="hashed")
    session.add(user)
    session.commit()
    session.refresh(user)

    booking = Booking(
        user_id=user.id,
        duffel_order_id="ord_test123",
        booking_reference="ABC123",
        status=BookingStatus.CONFIRMED,
        total_amount="100.00",
        total_currency="USD",
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)

    token = create_access_token(data={"sub": user.email, "purpose": "access"})
    headers = {"Authorization": f"Bearer {token}"}
    return booking, headers


def test_create_order_change_request_rejects_unowned_order(session, db_client):
    _, headers = _make_booking_and_auth(session)

    response = db_client.post(
        "/booking/flight-orders/ord_not_mine/change-requests",
        json={
            "remove": [{"slice_id": "sli_test123"}],
            "add": [
                {
                    "origin": "JFK",
                    "destination": "LHR",
                    "departure_date": "2026-09-01",
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 404


def test_create_order_change_request_proxies_to_duffel(session, db_client, monkeypatch):
    booking, headers = _make_booking_and_auth(session)

    captured = []

    async def fake_create_order_change_request(order_id, slices):
        captured.append((order_id, slices))
        return {
            "data": {
                "id": "ocr_test123",
                "order_id": order_id,
                "live_mode": False,
            }
        }

    monkeypatch.setattr(
        duffel_flight_service,
        "create_order_change_request",
        fake_create_order_change_request,
    )

    response = db_client.post(
        f"/booking/flight-orders/{booking.duffel_order_id}/change-requests",
        json={
            "remove": [{"slice_id": "sli_test123"}],
            "add": [
                {
                    "origin": "JFK",
                    "destination": "LHR",
                    "departure_date": "2026-09-01",
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "ocr_test123"
    assert captured[0][0] == "ord_test123"
    assert captured[0][1]["remove"] == [{"slice_id": "sli_test123"}]


def test_confirm_order_change_resyncs_booking_slices(session, db_client, monkeypatch):
    booking, headers = _make_booking_and_auth(session)

    async def fake_confirm_order_change(order_change_id, payment):
        assert order_change_id == "oce_test123"
        assert payment == {"type": "balance", "currency": "USD", "amount": "25.00"}
        return {
            "data": {
                "id": order_change_id,
                "order_id": "ord_test123",
                "confirmed_at": "2026-07-28T00:00:00Z",
                "new_total_amount": "125.00",
                "new_total_currency": "USD",
            }
        }

    async def fake_get_flight_order(order_id):
        return {
            "data": {
                "id": order_id,
                "booking_reference": "ABC123",
                "total_amount": "125.00",
                "total_currency": "USD",
                "slices": [
                    {
                        "id": "sli_new123",
                        "origin": {"iata_code": "JFK"},
                        "destination": {"iata_code": "CDG"},
                        "segments": [
                            {
                                "id": "seg_new123",
                                "origin": {"iata_code": "JFK"},
                                "destination": {"iata_code": "CDG"},
                                "departing_at": "2026-09-05T10:00:00",
                                "arriving_at": "2026-09-05T22:00:00",
                            }
                        ],
                    }
                ],
            }
        }

    monkeypatch.setattr(
        duffel_flight_service, "confirm_order_change", fake_confirm_order_change
    )
    monkeypatch.setattr(
        duffel_flight_service, "get_flight_order", fake_get_flight_order
    )

    response = db_client.post(
        f"/booking/flight-orders/{booking.duffel_order_id}/changes/oce_test123/confirm",
        json={"payment": {"type": "balance", "currency": "USD", "amount": "25.00"}},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["new_total_amount"] == "125.00"

    session.refresh(booking)
    assert booking.total_amount == "125.00"
    assert len(booking.slices) == 1
    assert booking.slices[0].destination_iata_code == "CDG"
