"""Unit + router tests for the Duffel webhook receiver (routers/webhooks.py):
signature verification (utils/duffel_webhooks.py) is the security-critical
piece and gets pure-function tests; the endpoint itself is tested through
the shared api_client fixture (conftest.py - see its docstring for why
there must be exactly one TestClient for the whole suite) with an
in-memory SQLite DB (StaticPool - the DB session override and the app run
in different threads under TestClient's ASGI bridge, so a single shared
connection is required, not just a shared in-memory file).
"""

import hashlib
import hmac
import json
import time

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
import backend.routers.webhooks as webhooks_module
from backend.config import settings
from backend.crud.db import get_session
from backend.main import app
from backend.models.bookings import Booking, BookingStatus
from backend.models.users import UserInDB
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.duffel_webhooks import verify_duffel_signature

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


def _sign(secret: str, body: bytes, timestamp: str) -> str:
    signed_payload = timestamp.encode() + b"." + body
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={signature}"


def test_verify_duffel_signature_accepts_a_valid_signature():
    secret = "whsec_test"
    body = b'{"hello":"world"}'
    header = _sign(secret, body, "1700000000")
    assert verify_duffel_signature(secret, body, header) is True


def test_verify_duffel_signature_rejects_a_tampered_body():
    secret = "whsec_test"
    header = _sign(secret, b'{"hello":"world"}', "1700000000")
    assert verify_duffel_signature(secret, b'{"hello":"tampered"}', header) is False


def test_verify_duffel_signature_rejects_wrong_secret():
    header = _sign("whsec_real", b'{"a":1}', "1700000000")
    assert verify_duffel_signature("whsec_wrong", b'{"a":1}', header) is False


def test_verify_duffel_signature_rejects_malformed_header():
    assert verify_duffel_signature("whsec_test", b"{}", "not-a-valid-header") is False


def test_verify_duffel_signature_rejects_when_no_secret_configured():
    header = _sign("whsec_real", b"{}", "1700000000")
    assert verify_duffel_signature("", b"{}", header) is False


def _override_get_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def client(api_client):
    """The shared api_client (conftest.py), with get_session overridden to
    the in-memory SQLite engine for the duration of each test."""
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


def _make_booking(session: Session) -> Booking:
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
    return booking


def test_duffel_webhook_records_change_and_publishes_event(
    session, client, monkeypatch
):
    booking = _make_booking(session)
    secret = "whsec_test"
    monkeypatch.setattr(settings, "DUFFEL_WEBHOOK_SECRET", secret)

    published = []
    monkeypatch.setattr(
        webhooks_module.kafka_producer,
        "publish_event",
        lambda topic, event_type, data: published.append((topic, event_type, data)),
    )

    body = json.dumps(
        {
            "type": "order.airline_initiated_change_detected",
            "data": {"object": {"id": "ord_test123"}},
        }
    ).encode()
    timestamp = str(int(time.time()))
    signature = _sign(secret, body, timestamp)

    response = client.post(
        "/api/v1/webhooks/duffel",
        content=body,
        headers={"X-Duffel-Signature": signature, "Content-Type": "application/json"},
    )

    assert response.status_code == 200
    session.refresh(booking)
    assert booking.airline_initiated_change_detected_at is not None

    assert len(published) == 1
    topic, event_type, data = published[0]
    assert topic == KafkaTopics.BOOKING_EVENTS
    assert event_type == KafkaEventTypes.AIRLINE_CHANGE_DETECTED
    assert data == {"booking_id": booking.id, "user_id": booking.user_id}


def test_duffel_webhook_rejects_bad_signature_without_touching_booking(
    session, client, monkeypatch
):
    booking = _make_booking(session)
    monkeypatch.setattr(settings, "DUFFEL_WEBHOOK_SECRET", "whsec_real")

    body = json.dumps(
        {
            "type": "order.airline_initiated_change_detected",
            "data": {"object": {"id": "ord_test123"}},
        }
    ).encode()
    bad_signature = _sign("whsec_wrong", body, str(int(time.time())))

    response = client.post(
        "/api/v1/webhooks/duffel",
        content=body,
        headers={
            "X-Duffel-Signature": bad_signature,
            "Content-Type": "application/json",
        },
    )

    # 200 even on rejection - see routers/webhooks.py's docstring on why.
    assert response.status_code == 200
    session.refresh(booking)
    assert booking.airline_initiated_change_detected_at is None


def test_duffel_webhook_ignores_unhandled_event_types(session, client, monkeypatch):
    booking = _make_booking(session)
    secret = "whsec_test"
    monkeypatch.setattr(settings, "DUFFEL_WEBHOOK_SECRET", secret)

    body = json.dumps(
        {"type": "ping.triggered", "data": {"object": {"id": "ord_test123"}}}
    ).encode()
    signature = _sign(secret, body, str(int(time.time())))

    response = client.post(
        "/api/v1/webhooks/duffel",
        content=body,
        headers={"X-Duffel-Signature": signature, "Content-Type": "application/json"},
    )

    assert response.status_code == 200
    session.refresh(booking)
    assert booking.airline_initiated_change_detected_at is None


def test_order_created_does_not_flag_an_airline_change(session, client, monkeypatch):
    """Only the airline-change event may take the airline-change path.

    Everything after the event-type check reads data.object.id as an
    ORDER id and stamps the booking, so admitting order.created here
    means every newly created booking is marked as airline-changed and
    the customer is emailed "your flight may have changed" - on the happy
    path of every booking, with a real order id that really does resolve
    to one of ours.
    """
    booking = _make_booking(session)
    secret = "whsec_test"
    monkeypatch.setattr(settings, "DUFFEL_WEBHOOK_SECRET", secret)

    published = []
    monkeypatch.setattr(
        webhooks_module.kafka_producer,
        "publish_event",
        lambda topic, event_type, data: published.append((topic, event_type, data)),
    )

    body = json.dumps(
        {"type": "order.created", "data": {"object": {"id": "ord_test123"}}}
    ).encode()
    timestamp = str(int(time.time()))

    response = client.post(
        "/api/v1/webhooks/duffel",
        content=body,
        headers={
            "X-Duffel-Signature": _sign(secret, body, timestamp),
            "Content-Type": "application/json",
        },
    )

    assert response.status_code == 200
    session.refresh(booking)
    assert booking.airline_initiated_change_detected_at is None
    assert published == []
