"""Router-level tests for the support contact form (routers/support.py) -
the actual email/notification side effects live in the Kafka consumer
(backend/workers/kafka_consumer.py, tested separately), so this only
checks that the right event is published."""

from backend.routers import support as support_router
from backend.utils.constants import KafkaEventTypes, KafkaTopics


def test_contact_support_publishes_event(api_client, monkeypatch):
    published = []

    def fake_publish_event(topic, event_type, data):
        published.append((topic, event_type, data))

    monkeypatch.setattr(
        support_router.kafka_producer, "publish_event", fake_publish_event
    )

    response = api_client.post(
        "/support/contact",
        json={
            "name": "Amelia Earhart",
            "email": "amelia@example.com",
            "subject": "Question about my booking",
            "message": "Can I add a bag to my existing booking?",
            "booking_reference": "ABC123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Thanks - we'll get back to you by email shortly."
    }

    assert len(published) == 1
    topic, event_type, data = published[0]
    assert topic == KafkaTopics.SUPPORT_EVENTS
    assert event_type == KafkaEventTypes.SUPPORT_REQUEST_RECEIVED
    assert data == {
        "name": "Amelia Earhart",
        "email": "amelia@example.com",
        "subject": "Question about my booking",
        "message": "Can I add a bag to my existing booking?",
        "booking_reference": "ABC123",
    }


def test_contact_support_rejects_missing_fields(api_client):
    response = api_client.post(
        "/support/contact",
        json={"name": "", "email": "not-an-email", "subject": "", "message": ""},
    )

    assert response.status_code == 422
