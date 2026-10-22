"""The queue subscriber - what replaced the Kafka consumer's poll loop.

The dispatch table is shared with the loop that came before, so what is
worth pinning here is the behaviour that changed: delivery is retried on
exception now, and that makes "which failures retry" a real decision.
"""

import asyncio
from typing import Any

from backend.queues import events as subscriber


class _Message:
    """Stands in for vercel.queue.Message; the handler only reads .payload.

    @subscribe registers the function as a side effect and returns it
    unwrapped, so it can be called directly.
    """

    def __init__(self, payload: Any):
        self.payload = payload


def _run(payload: Any) -> None:
    asyncio.run(subscriber.handle_event(_Message(payload)))


def test_dispatches_to_the_handler_for_the_event_type(monkeypatch):
    seen = []

    async def handler(data):
        seen.append(data)

    monkeypatch.setattr(subscriber, "_handlers", lambda: {"user_registered": handler})
    _run({"event_type": "user_registered", "data": {"email": "a@b.c"}})

    assert seen == [{"email": "a@b.c"}]


def test_an_unknown_event_type_is_accepted_rather_than_retried():
    # Retrying would redeliver until the message expires, against a dispatch
    # table that is never going to grow a handler mid-flight.
    _run({"event_type": "something_nobody_handles", "data": {}})


def test_a_failing_handler_raises_so_the_message_is_redelivered(monkeypatch):
    # The Kafka consumer logged and committed past a failure. Queues retries,
    # which is the better default: a handler that failed because the mail
    # provider blipped should run again.
    async def exploding(data):
        raise RuntimeError("Resend is down")

    monkeypatch.setattr(subscriber, "_handlers", lambda: {"user_registered": exploding})

    try:
        _run({"event_type": "user_registered", "data": {}})
    except RuntimeError as exc:
        assert "Resend is down" in str(exc)
    else:
        raise AssertionError("handler failure must propagate so delivery retries")


def test_an_empty_payload_does_not_crash_the_consumer():
    _run(None)
    _run({})


def test_missing_data_key_passes_an_empty_mapping(monkeypatch):
    seen = []

    async def handler(data):
        seen.append(data)

    monkeypatch.setattr(subscriber, "_handlers", lambda: {"user_registered": handler})
    _run({"event_type": "user_registered"})

    assert seen == [{}]


def test_retries_are_bounded():
    # Without a cap, a permanently failing message is redelivered until it
    # expires - 24 hours of a handler that is never going to succeed.
    assert subscriber.MAX_ATTEMPTS == 5
