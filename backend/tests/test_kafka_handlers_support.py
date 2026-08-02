"""Unit tests for workers/handlers/support.py."""

import asyncio

from sqlmodel import Session, select

import backend.workers.handlers.support as support_handlers
from backend.models.notifications import Notification
from backend.models.users import UserInDB


def _run(coro):
    return asyncio.run(coro)


def test_handle_support_request_received_emails_and_notifies_staff(
    sqlite_engine, monkeypatch
):
    with Session(sqlite_engine) as session:
        staff = UserInDB(email="staff@flyt.io", password="x", is_staff=True)
        session.add(staff)
        session.commit()
        staff_id = staff.id

    monkeypatch.setattr(support_handlers, "engine", sqlite_engine)

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append(
            (subject, recipients, kwargs.get("reply_to"), kwargs.get("from_address"))
        )

    monkeypatch.setattr(
        support_handlers, "send_html_email_async", fake_send_html_email_async
    )

    _run(
        support_handlers._handle_support_request_received(
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
    assert relay_recipients == [support_handlers.SENDER_SUPPORT]
    assert relay_reply_to == "amelia@example.com"

    autoreply_subject, autoreply_recipients, _, autoreply_from = sent[1]
    assert autoreply_subject == "We've received your message"
    assert autoreply_recipients == ["amelia@example.com"]
    assert autoreply_from == support_handlers.SENDER_SUPPORT

    with Session(sqlite_engine) as session:
        notifications = session.exec(select(Notification)).all()
        assert len(notifications) == 1
        assert notifications[0].user_id == staff_id
        assert "Question about my booking" in notifications[0].title
