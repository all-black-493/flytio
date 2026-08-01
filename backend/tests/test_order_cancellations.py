"""Router-level tests for the order-cancellation confirm flow
(routers/bookings.py's confirm_order_cancellation) - requesting a
cancellation quote is just a Duffel proxy with no side effects and
isn't covered here; this is the confirm step, which mutates the
booking and publishes a Kafka event."""

import pytest
from sqlmodel import Session

import backend.routers.bookings as bookings_module
from backend.crud.db import get_session
from backend.external_services.flight import duffel_flight_service
from backend.main import app
from backend.models.bookings import Booking, BookingStatus
from backend.models.users import UserInDB
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.security import create_access_token


@pytest.fixture
def db_client(api_client, sqlite_engine):
    def _override_get_session():
        with Session(sqlite_engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_session, None)


def _make_booking_and_auth(
    sqlite_engine, *, status: BookingStatus = BookingStatus.CONFIRMED
):
    with Session(sqlite_engine) as session:
        user = UserInDB(email="traveler@example.com", password="hashed")
        session.add(user)
        session.commit()
        session.refresh(user)

        booking = Booking(
            user_id=user.id,
            duffel_order_id="ord_test123",
            booking_reference="ABC123",
            status=status,
            total_amount="100.00",
            total_currency="USD",
        )
        session.add(booking)
        session.commit()
        session.refresh(booking)

        token = create_access_token(data={"sub": user.email, "purpose": "access"})
        headers = {"Authorization": f"Bearer {token}"}
        return booking.id, user.id, headers


def test_confirm_order_cancellation_publishes_event(
    sqlite_engine, db_client, monkeypatch
):
    booking_id, user_id, headers = _make_booking_and_auth(sqlite_engine)

    async def fake_confirm_order_cancellation(order_cancellation_id):
        assert order_cancellation_id == "orc_test123"
        return {
            "data": {
                "id": order_cancellation_id,
                "order_id": "ord_test123",
                "refund_amount": "100.00",
                "refund_currency": "USD",
                "confirmed_at": "2026-07-28T00:00:00Z",
            }
        }

    monkeypatch.setattr(
        duffel_flight_service,
        "confirm_order_cancellation",
        fake_confirm_order_cancellation,
    )

    published = []
    monkeypatch.setattr(
        bookings_module.kafka_producer,
        "publish_event",
        lambda topic, event_type, data: published.append((topic, event_type, data)),
    )

    response = db_client.post(
        "/booking/flight-orders/ord_test123/cancellations/orc_test123/confirm",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["refund_amount"] == "100.00"

    with Session(sqlite_engine) as session:
        booking = session.get(Booking, booking_id)
        assert booking.status == BookingStatus.CANCELLED
        assert booking.cancelled_at is not None

    assert len(published) == 1
    topic, event_type, data = published[0]
    assert topic == KafkaTopics.BOOKING_EVENTS
    assert event_type == KafkaEventTypes.BOOKING_CANCELLED
    assert data == {
        "user_id": user_id,
        "booking_id": booking_id,
        "booking_reference": "ABC123",
    }


def test_confirm_order_cancellation_rejects_already_cancelled(
    sqlite_engine, db_client, monkeypatch
):
    _, _, headers = _make_booking_and_auth(
        sqlite_engine, status=BookingStatus.CANCELLED
    )

    called = []
    monkeypatch.setattr(
        duffel_flight_service,
        "confirm_order_cancellation",
        lambda order_cancellation_id: called.append(order_cancellation_id),
    )
    published = []
    monkeypatch.setattr(
        bookings_module.kafka_producer,
        "publish_event",
        lambda topic, event_type, data: published.append((topic, event_type, data)),
    )

    response = db_client.post(
        "/booking/flight-orders/ord_test123/cancellations/orc_test123/confirm",
        headers=headers,
    )

    assert response.status_code == 400
    assert called == []
    assert published == []
