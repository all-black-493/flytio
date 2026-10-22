"""The event publisher - what replaced the Kafka producer.

The envelope and the swallow-on-failure behaviour are the parts other code
depends on, so they are what is pinned here.
"""

import asyncio
import datetime
import decimal
import uuid

import pytest


from backend.utils import events
from backend.utils.constants import EventTopics


def test_envelope_has_the_shape_every_handler_reads():
    envelope = events.build_envelope("booking_confirmed", {"booking_id": "b1"})

    assert sorted(envelope) == ["data", "event_type", "timestamp"]
    assert envelope["event_type"] == "booking_confirmed"
    assert envelope["data"] == {"booking_id": "b1"}


def test_timestamp_is_utc_and_parseable():
    stamped = events.build_envelope("x", {})["timestamp"]
    assert datetime.datetime.fromisoformat(stamped).tzinfo is not None


def test_publish_sends_the_envelope_to_the_topic(monkeypatch):
    sent = []

    async def fake_send(topic, payload, **kwargs):
        sent.append((topic, payload))
        return "msg_1"

    monkeypatch.setattr(events, "send", fake_send)
    asyncio.run(events.publish_event("payment-events", "booking_confirmed", {"id": 1}))

    topic, payload = sent[0]
    assert topic == "payment-events"
    assert payload["event_type"] == "booking_confirmed"
    assert payload["data"] == {"id": 1}


def test_values_json_cannot_carry_are_coerced_to_strings(monkeypatch):
    # UUID primary keys, datetimes and Decimal amounts all reach this layer,
    # and the Kafka producer coerced them with json.dumps(default=str) so no
    # call site had to remember. The queue SDK does not, so this does.
    sent = []

    async def fake_send(topic, payload, **kwargs):
        sent.append(payload)
        return "msg_1"

    monkeypatch.setattr(events, "send", fake_send)
    asyncio.run(
        events.publish_event(
            "booking-events",
            "booking_cancelled",
            {
                "booking_id": uuid.UUID(int=7),
                "at": datetime.datetime(2026, 1, 1),
                "amount": decimal.Decimal("12.50"),
                "count": 3,
                "nothing": None,
            },
        )
    )

    data = sent[0]["data"]
    assert data["booking_id"] == "00000000-0000-0000-0000-000000000007"
    assert data["amount"] == "12.50"
    # Types JSON already carries are left alone rather than stringified.
    assert data["count"] == 3
    assert data["nothing"] is None


def test_a_queue_outage_does_not_reach_the_caller(monkeypatch):
    # A booking that succeeded must not fail because the thing that sends its
    # confirmation email was briefly unreachable.
    async def exploding_send(topic, payload, **kwargs):
        raise RuntimeError("queue unreachable")

    monkeypatch.setattr(events, "send", exploding_send)
    asyncio.run(
        events.publish_event("user-events", "user_registered", {"email": "a@b.c"})
    )


def test_nested_structures_are_coerced_too(monkeypatch):
    sent = []

    async def fake_send(topic, payload, **kwargs):
        sent.append(payload)
        return "m"

    monkeypatch.setattr(events, "send", fake_send)
    asyncio.run(
        events.publish_event(
            "t", "e", {"passengers": [{"id": uuid.UUID(int=1)}], "meta": {"n": 1}}
        )
    )

    assert sent[0]["data"]["passengers"][0]["id"].startswith("00000000")
    assert sent[0]["data"]["meta"] == {"n": 1}


def test_every_topic_is_a_name_vercel_queues_accepts():
    """The SDK's own validator, not a copy of its pattern.

    Dotted Kafka-style names ("payment.events") are rejected at publish
    time, and publish_event swallows failures so the request still
    succeeds - so every event went nowhere, silently, in production.
    """
    from vercel.queue._internal.names import validate_topic_name

    topics = [
        value
        for name, value in vars(EventTopics).items()
        if not name.startswith("_") and isinstance(value, str)
    ]
    assert topics

    for topic in topics:
        validate_topic_name(topic)


def test_a_dotted_topic_would_still_be_rejected():
    """Guards the guard: proves the validator above is doing something."""
    from vercel.queue._internal.names import validate_topic_name

    with pytest.raises(ValueError):
        validate_topic_name("payment.events")
