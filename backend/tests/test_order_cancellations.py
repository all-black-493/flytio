"""Router-level tests for the order-cancellation flow
(routers/bookings.py): the confirm step, which mutates the booking and
publishes the event that triggers the customer's refund, and the quote
step, which is no longer a plain Duffel proxy - it now also reports what
the *customer* would get back, which is a different number from Duffel's
own refund (see backend/crud/refunds.py)."""

import uuid

import pytest
from sqlmodel import Session

import backend.routers.bookings as bookings_module
from backend.crud.db import get_session
from backend.external_services.flight import duffel_flight_service
from backend.main import app
from backend.models.bookings import Booking, BookingStatus
from backend.models.payments import Payment, PaymentStatus
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
        "/api/v1/booking/flight-orders/ord_test123/cancellations/orc_test123/confirm",
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
    # The Duffel refund figures ride along on the event so the consumer
    # can work out the customer's refund (crud/refunds.py) without a
    # second round trip to Duffel for a quote that may have expired.
    assert data == {
        "user_id": user_id,
        "booking_id": booking_id,
        "booking_reference": "ABC123",
        "duffel_refund_amount": "100.00",
        "duffel_refund_currency": "USD",
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
        "/api/v1/booking/flight-orders/ord_test123/cancellations/orc_test123/confirm",
        headers=headers,
    )

    assert response.status_code == 400
    assert called == []
    assert published == []


def _completed_payment(sqlite_engine, user_id, booking_id, **kwargs):
    defaults = dict(
        amount="10700.00",
        duffel_amount="10000.00",
        currency="USD",
        payment_method="MpesaKE",
        pesapal_confirmation_code="AA11BB22",
    )
    defaults.update(kwargs)
    with Session(sqlite_engine) as session:
        payment = Payment(
            user_id=user_id,
            booking_id=booking_id,
            order_request_snapshot="{}",
            merchant_reference=f"flyt-{uuid.uuid4().hex[:10]}",
            status=PaymentStatus.COMPLETED,
            **defaults,
        )
        session.add(payment)
        session.commit()


def _mock_quote(monkeypatch, refund_amount: str):
    async def fake_request_order_cancellation(order_id):
        return {
            "data": {
                "id": "orc_test123",
                "order_id": order_id,
                "refund_amount": refund_amount,
                "refund_currency": "USD",
                "refund_to": "balance",
                "expires_at": "2026-09-01T00:00:00Z",
                "confirmed_at": None,
            }
        }

    monkeypatch.setattr(
        duffel_flight_service,
        "request_order_cancellation",
        fake_request_order_cancellation,
    )


def test_quote_reports_what_the_customer_gets_not_duffels_refund(
    sqlite_engine, db_client, monkeypatch
):
    """Duffel's refund_amount goes to flyt's balance and is quoted against
    the raw fare - with a discount code it can exceed what the customer
    paid. The customer_refund block is what the UI must show, so it has to
    be capped the same way the payout is."""
    booking_id, user_id, headers = _make_booking_and_auth(sqlite_engine)
    _completed_payment(sqlite_engine, user_id, booking_id, amount="9700.00")
    _mock_quote(monkeypatch, "10000.00")

    response = db_client.post(
        "/api/v1/booking/flight-orders/ord_test123/cancellations", headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["refund_amount"] == "10000.00"
    assert body["customer_refund"]["amount"] == "9700.00"
    assert body["customer_refund"]["to_original_payment_method"] is True


def test_quote_warns_when_the_refund_cannot_go_back_automatically(
    sqlite_engine, db_client, monkeypatch
):
    """A partial refund on M-Pesa can't be sent through Pesapal at all, so
    the dialog must not promise the original payment method."""
    booking_id, user_id, headers = _make_booking_and_auth(sqlite_engine)
    _completed_payment(sqlite_engine, user_id, booking_id, payment_method="MpesaKE")
    _mock_quote(monkeypatch, "8000.00")

    response = db_client.post(
        "/api/v1/booking/flight-orders/ord_test123/cancellations", headers=headers
    )

    body = response.json()
    assert body["customer_refund"]["amount"] == "8000.00"
    assert body["customer_refund"]["to_original_payment_method"] is False
    assert "mobile money" in body["customer_refund"]["manual_payout_reason"]
