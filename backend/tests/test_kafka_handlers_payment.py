"""Unit tests for workers/handlers/payment.py."""

import asyncio
import uuid

from sqlmodel import Session, select

import backend.workers.handlers.payment as payment_handlers
from backend.models.bookings import Booking
from backend.models.notifications import Notification
from backend.models.users import UserInDB


def _run(coro):
    return asyncio.run(coro)


def test_handle_booking_confirmed_emails_and_notifies_customer(
    sqlite_engine, monkeypatch
):
    with Session(sqlite_engine) as session:
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

    monkeypatch.setattr(payment_handlers, "engine", sqlite_engine)

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append((subject, recipients, kwargs.get("from_address")))

    monkeypatch.setattr(
        payment_handlers, "send_html_email_async", fake_send_html_email_async
    )
    monkeypatch.setattr(
        payment_handlers, "booking_confirmation_email_html", lambda booking: "<html/>"
    )

    _run(
        payment_handlers._handle_booking_confirmed(
            {"booking_id": str(booking_id), "user_id": str(customer_id)}
        )
    )

    assert len(sent) == 1
    subject, recipients, from_address = sent[0]
    assert subject == "You're booked! Reference ABC123"
    assert recipients == ["customer@example.com"]
    assert from_address == payment_handlers.SENDER_BOOKINGS

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert "ABC123" in notifications[0].title


def test_handle_booking_confirmed_missing_booking_is_a_noop(sqlite_engine, monkeypatch):
    monkeypatch.setattr(payment_handlers, "engine", sqlite_engine)

    sent = []
    monkeypatch.setattr(
        payment_handlers,
        "send_html_email_async",
        lambda *a, **k: sent.append(a),
    )

    _run(
        payment_handlers._handle_booking_confirmed(
            {"booking_id": str(uuid.uuid4()), "user_id": str(uuid.uuid4())}
        )
    )

    assert sent == []
    with Session(sqlite_engine) as session:
        assert session.exec(select(Notification)).all() == []


def test_handle_booking_failed_notifies_customer_and_staff(sqlite_engine, monkeypatch):
    with Session(sqlite_engine) as session:
        customer = UserInDB(email="customer@example.com", password="x")
        staff = UserInDB(email="staff@flyt.io", password="x", is_staff=True)
        session.add(customer)
        session.add(staff)
        session.commit()
        customer_id = customer.id

    monkeypatch.setattr(payment_handlers, "engine", sqlite_engine)

    _run(
        payment_handlers._handle_booking_failed(
            {
                "payment_id": str(uuid.uuid4()),
                "user_id": str(customer_id),
                "failure_reason": "offer expired",
            }
        )
    )

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 2
        by_user = {n.user_id: n for n in notifications}
        assert by_user[customer_id].title == "We couldn't complete your booking"
        staff_notification = next(n for n in notifications if n.user_id != customer_id)
        assert "offer expired" in staff_notification.body


def test_handle_discount_redemption_failed_notifies_staff(sqlite_engine, monkeypatch):
    with Session(sqlite_engine) as session:
        staff = UserInDB(email="staff@flyt.io", password="x", is_staff=True)
        session.add(staff)
        session.commit()
        staff_id = staff.id

    monkeypatch.setattr(payment_handlers, "engine", sqlite_engine)

    _run(
        payment_handlers._handle_discount_redemption_failed(
            {"payment_id": str(uuid.uuid4()), "discount_code": "SUMMER10"}
        )
    )

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == staff_id
        assert "SUMMER10" in notifications[0].title
