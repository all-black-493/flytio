"""Unit tests for workers/handlers/user.py - the poll loop itself talks
to a real broker and isn't exercised here; this tests that the handler
does the right thing given an event's `data` payload, the same shape
utils/kafka.py's publish_event puts on the wire."""

import asyncio

import backend.workers.handlers.user as user_handlers


def _run(coro):
    return asyncio.run(coro)


def test_handle_user_registered_sends_welcome_email(monkeypatch):
    sent = []

    async def fake_send_email_async(subject, recipients, body_text, **kwargs):
        sent.append((subject, recipients, kwargs.get("from_address")))

    monkeypatch.setattr(user_handlers, "send_email_async", fake_send_email_async)

    _run(
        user_handlers._handle_user_registered(
            {"user_id": "abc", "email": "a@example.com"}
        )
    )

    assert len(sent) == 1
    subject, recipients, from_address = sent[0]
    assert subject == "Welcome to flyt!"
    assert recipients == ["a@example.com"]
    assert from_address == user_handlers.SENDER_WELCOME
