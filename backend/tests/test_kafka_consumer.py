"""Unit tests for the Kafka consumer's event handlers
(backend/workers/kafka_consumer.py) - the poll loop itself talks to a
real broker and isn't exercised here; these test that each handler does
the right thing given an event's `data` payload, the same shape
utils/kafka.py's publish_event puts on the wire."""

import asyncio
import uuid

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
import backend.workers.kafka_consumer as consumer_module
from backend.models.bookings import Booking
from backend.models.notifications import Notification
from backend.models.users import UserInDB


def _test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


def _run(coro):
    return asyncio.run(coro)


def test_handle_user_registered_sends_welcome_email(monkeypatch):
    sent = []

    async def fake_send_email_async(subject, recipients, body_text, **kwargs):
        sent.append((subject, recipients, kwargs.get("from_address")))

    monkeypatch.setattr(consumer_module, "send_email_async", fake_send_email_async)

    _run(
        consumer_module._handle_user_registered(
            {"user_id": "abc", "email": "a@example.com"}
        )
    )

    assert len(sent) == 1
    subject, recipients, from_address = sent[0]
    assert subject == "Welcome to flyt!"
    assert recipients == ["a@example.com"]
    assert from_address == consumer_module.SENDER_WELCOME


def test_handle_support_request_received_emails_and_notifies_staff(monkeypatch):
    engine = _test_engine()
    with Session(engine) as session:
        staff = UserInDB(email="staff@flyt.io", password="x", is_staff=True)
        session.add(staff)
        session.commit()
        staff_id = staff.id

    monkeypatch.setattr(consumer_module, "engine", engine)

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append(
            (subject, recipients, kwargs.get("reply_to"), kwargs.get("from_address"))
        )

    monkeypatch.setattr(
        consumer_module, "send_html_email_async", fake_send_html_email_async
    )

    _run(
        consumer_module._handle_support_request_received(
            {
                "name": "Amelia Earhart",
                "email": "amelia@example.com",
                "subject": "Question about my booking",
                "message": "Can I add a bag?",
                "booking_reference": "ABC123",
            }
        )
    )

    assert len(sent) == 2
    relay_subject, relay_recipients, relay_reply_to, _ = sent[0]
    assert relay_subject == "Support: Question about my booking"
    assert relay_recipients == [consumer_module.SENDER_SUPPORT]
    assert relay_reply_to == "amelia@example.com"

    autoreply_subject, autoreply_recipients, _, autoreply_from = sent[1]
    assert autoreply_subject == "We've received your message"
    assert autoreply_recipients == ["amelia@example.com"]
    assert autoreply_from == consumer_module.SENDER_SUPPORT

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == staff_id
        assert "Question about my booking" in notifications[0].title


def test_handle_booking_confirmed_emails_and_notifies_customer(monkeypatch):
    engine = _test_engine()
    with Session(engine) as session:
        customer = UserInDB(email="customer@example.com", password="x")
        session.add(customer)
        session.commit()
        customer_id = customer.id
        booking = Booking(
            user_id=customer_id,
            duffel_order_id="ord_test123",
            booking_reference="ABC123",
            total_amount="100.00",
            total_currency="USD",
        )
        session.add(booking)
        session.commit()
        booking_id = booking.id

    monkeypatch.setattr(consumer_module, "engine", engine)

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append((subject, recipients, kwargs.get("from_address")))

    monkeypatch.setattr(
        consumer_module, "send_html_email_async", fake_send_html_email_async
    )
    monkeypatch.setattr(
        consumer_module, "booking_confirmation_email_html", lambda booking: "<html/>"
    )

    _run(
        consumer_module._handle_booking_confirmed(
            {"booking_id": str(booking_id), "user_id": str(customer_id)}
        )
    )

    assert len(sent) == 1
    subject, recipients, from_address = sent[0]
    assert subject == "You're booked! Reference ABC123"
    assert recipients == ["customer@example.com"]
    assert from_address == consumer_module.SENDER_BOOKINGS

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert "ABC123" in notifications[0].title


def test_handle_booking_confirmed_missing_booking_is_a_noop(monkeypatch):
    engine = _test_engine()
    monkeypatch.setattr(consumer_module, "engine", engine)

    sent = []
    monkeypatch.setattr(
        consumer_module,
        "send_html_email_async",
        lambda *a, **k: sent.append(a),
    )

    _run(
        consumer_module._handle_booking_confirmed(
            {"booking_id": str(uuid.uuid4()), "user_id": str(uuid.uuid4())}
        )
    )

    assert sent == []
    with Session(engine) as session:
        assert session.exec(select(Notification)).all() == []


def test_handle_booking_failed_notifies_customer_and_staff(monkeypatch):
    engine = _test_engine()
    with Session(engine) as session:
        customer = UserInDB(email="customer@example.com", password="x")
        staff = UserInDB(email="staff@flyt.io", password="x", is_staff=True)
        session.add(customer)
        session.add(staff)
        session.commit()
        customer_id = customer.id

    monkeypatch.setattr(consumer_module, "engine", engine)

    _run(
        consumer_module._handle_booking_failed(
            {
                "payment_id": str(uuid.uuid4()),
                "user_id": str(customer_id),
                "failure_reason": "offer expired",
            }
        )
    )

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 2
        by_user = {n.user_id: n for n in notifications}
        assert by_user[customer_id].title == "We couldn't complete your booking"
        staff_notification = next(n for n in notifications if n.user_id != customer_id)
        assert "offer expired" in staff_notification.body


def test_handle_discount_redemption_failed_notifies_staff(monkeypatch):
    engine = _test_engine()
    with Session(engine) as session:
        staff = UserInDB(email="staff@flyt.io", password="x", is_staff=True)
        session.add(staff)
        session.commit()
        staff_id = staff.id

    monkeypatch.setattr(consumer_module, "engine", engine)

    _run(
        consumer_module._handle_discount_redemption_failed(
            {"payment_id": str(uuid.uuid4()), "discount_code": "SUMMER10"}
        )
    )

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == staff_id
        assert "SUMMER10" in notifications[0].title


def test_handle_booking_cancelled_notifies_customer(monkeypatch):
    engine = _test_engine()
    monkeypatch.setattr(consumer_module, "engine", engine)
    customer_id = uuid.uuid4()
    booking_id = uuid.uuid4()

    with Session(engine) as session:
        session.add(
            UserInDB(id=customer_id, email="customer@example.com", password="x")
        )
        session.commit()

    _run(
        consumer_module._handle_booking_cancelled(
            {
                "user_id": str(customer_id),
                "booking_id": str(booking_id),
                "booking_reference": "ABC123",
            }
        )
    )

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert notifications[0].title == "Booking ABC123 cancelled"


def test_handle_booking_change_confirmed_notifies_customer(monkeypatch):
    engine = _test_engine()
    monkeypatch.setattr(consumer_module, "engine", engine)
    customer_id = uuid.uuid4()
    booking_id = uuid.uuid4()

    with Session(engine) as session:
        session.add(
            UserInDB(id=customer_id, email="customer@example.com", password="x")
        )
        session.commit()

    _run(
        consumer_module._handle_booking_change_confirmed(
            {
                "user_id": str(customer_id),
                "booking_id": str(booking_id),
                "booking_reference": "ABC123",
            }
        )
    )

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert notifications[0].title == "Booking ABC123 updated"


def test_handle_airline_change_detected_emails_and_notifies_customer(monkeypatch):
    engine = _test_engine()
    with Session(engine) as session:
        customer = UserInDB(email="customer@example.com", password="x")
        session.add(customer)
        session.commit()
        customer_id = customer.id
        booking = Booking(
            user_id=customer_id,
            duffel_order_id="ord_test123",
            booking_reference="ABC123",
            total_amount="100.00",
            total_currency="USD",
            owner_name="Kenya Airways",
        )
        session.add(booking)
        session.commit()
        booking_id = booking.id

    monkeypatch.setattr(consumer_module, "engine", engine)

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append((subject, recipients, kwargs.get("from_address")))

    monkeypatch.setattr(
        consumer_module, "send_html_email_async", fake_send_html_email_async
    )
    monkeypatch.setattr(
        consumer_module, "airline_change_email_html", lambda booking: "<html/>"
    )

    _run(
        consumer_module._handle_airline_change_detected(
            {"booking_id": str(booking_id), "user_id": str(customer_id)}
        )
    )

    assert len(sent) == 1
    subject, recipients, from_address = sent[0]
    assert subject == "Your flight ABC123 may have changed"
    assert recipients == ["customer@example.com"]
    assert from_address == consumer_module.SENDER_BOOKINGS

    with Session(engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert "Kenya Airways" in notifications[0].body
