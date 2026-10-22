"""Unit tests for workers/handlers/booking.py."""

import asyncio
import uuid

from sqlmodel import Session, select

import backend.crud.refunds as refunds_module

import backend.workers.handlers.booking as booking_handlers
from backend.models.bookings import Booking
from backend.models.notifications import Notification
from backend.models.payments import Payment, PaymentStatus
from backend.models.refunds import Refund, RefundStatus
from backend.models.users import UserInDB


def _run(coro):
    return asyncio.run(coro)


def test_handle_booking_cancelled_notifies_customer(sqlite_engine, monkeypatch):
    monkeypatch.setattr(booking_handlers, "engine", sqlite_engine)
    customer_id = uuid.uuid4()
    booking_id = uuid.uuid4()

    with Session(sqlite_engine) as session:
        session.add(
            UserInDB(id=customer_id, email="customer@example.com", password="x")
        )
        session.commit()

    _run(
        booking_handlers._handle_booking_cancelled(
            {
                "user_id": str(customer_id),
                "booking_id": str(booking_id),
                "booking_reference": "ABC123",
            }
        )
    )

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert notifications[0].title == "Booking ABC123 cancelled"


def test_handle_booking_change_confirmed_notifies_customer(sqlite_engine, monkeypatch):
    monkeypatch.setattr(booking_handlers, "engine", sqlite_engine)
    customer_id = uuid.uuid4()
    booking_id = uuid.uuid4()

    with Session(sqlite_engine) as session:
        session.add(
            UserInDB(id=customer_id, email="customer@example.com", password="x")
        )
        session.commit()

    _run(
        booking_handlers._handle_booking_change_confirmed(
            {
                "user_id": str(customer_id),
                "booking_id": str(booking_id),
                "booking_reference": "ABC123",
            }
        )
    )

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert notifications[0].title == "Booking ABC123 updated"


def test_handle_airline_change_detected_emails_and_notifies_customer(
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
            owner_name="Kenya Airways",
        )
        session.add(booking)
        session.commit()
        booking_id = booking.id

    monkeypatch.setattr(booking_handlers, "engine", sqlite_engine)

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append((subject, recipients, kwargs.get("from_address")))

    monkeypatch.setattr(
        booking_handlers, "send_html_email_async", fake_send_html_email_async
    )
    monkeypatch.setattr(
        booking_handlers, "airline_change_email_html", lambda booking: "<html/>"
    )

    _run(
        booking_handlers._handle_airline_change_detected(
            {"booking_id": str(booking_id), "user_id": str(customer_id)}
        )
    )

    assert len(sent) == 1
    subject, recipients, from_address = sent[0]
    assert subject == "Your flight ABC123 may have changed"
    assert recipients == ["customer@example.com"]
    assert from_address == booking_handlers.SENDER_BOOKINGS

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == customer_id
        assert "Kenya Airways" in notifications[0].body


def test_handle_booking_cancelled_initiates_customer_refund(sqlite_engine, monkeypatch):
    """The cancellation event is what actually triggers the customer's
    money coming back (crud/refunds.py) - cancelling the Duffel order
    only refunded flyt's own balance."""
    monkeypatch.setattr(booking_handlers, "engine", sqlite_engine)

    customer_id = uuid.uuid4()
    booking_id = uuid.uuid4()
    with Session(sqlite_engine) as session:
        session.add(UserInDB(id=customer_id, email="c@example.com", password="x"))
        session.add(
            Booking(
                id=booking_id,
                user_id=customer_id,
                duffel_order_id="ord_refund1",
                booking_reference="RFND01",
                total_amount="10700.00",
                total_currency="KES",
            )
        )
        session.add(
            Payment(
                user_id=customer_id,
                booking_id=booking_id,
                order_request_snapshot="{}",
                amount="10700.00",
                duffel_amount="10000.00",
                currency="KES",
                merchant_reference="flyt-refund-1",
                payment_method="Visa",
                pesapal_confirmation_code="AA11BB22",
                status=PaymentStatus.COMPLETED,
            )
        )
        session.commit()

    sent = []

    async def fake_request_refund(**kwargs):
        sent.append(kwargs)
        return None

    monkeypatch.setattr(
        refunds_module.pesapal_payment_service, "request_refund", fake_request_refund
    )

    _run(
        booking_handlers._handle_booking_cancelled(
            {
                "user_id": str(customer_id),
                "booking_id": str(booking_id),
                "booking_reference": "RFND01",
                "duffel_refund_amount": "8000.00",
                "duffel_refund_currency": "KES",
            }
        )
    )

    assert len(sent) == 1
    assert sent[0]["amount"] == 8000.00
    with Session(sqlite_engine) as session:
        refund = session.exec(select(Refund)).one()
        assert refund.status == RefundStatus.REQUESTED
        assert refund.amount == "8000.00"
        assert refund.booking_id == booking_id
