"""Unit tests for utils/kafka.py's KafkaProducer/KafkaConsumer - the
singleton wrappers every producer call site and the consumer runner go
through. No real broker involved: `producer`/`consumer` are swapped for
lightweight fakes via monkeypatch (auto-reverted per test, since these
are process-wide singletons that would otherwise leak state between
tests)."""

import json
import uuid
from datetime import UTC, datetime

import backend.utils.kafka as kafka_module
from backend.utils.kafka import (
    KafkaConsumer,
    KafkaProducer,
    kafka_consumer,
    kafka_producer,
)


class _FakeProducer:
    """Mirrors the two behaviors of the real confluent_kafka.Producer that
    matter for utils/kafka.py's `if not self.producer:` initialization
    check: it has __len__ (queue length, used in the BufferError log
    line) but is still always truthy - Producer defines its own
    __bool__ precisely so an idle (empty-queue) producer doesn't read as
    "not initialized". Without __bool__ here too, this fake would go
    falsy whenever `produced` is empty and silently short-circuit send()
    before it ever reached produce() - confirmed by running with it
    missing: two "must not raise" tests kept passing for the wrong
    reason, because nothing ran at all."""

    def __init__(self):
        self.produced = []
        self.poll_calls = 0
        self.flush_calls = 0
        self.raise_on_produce = None

    def __bool__(self):
        return True

    def poll(self, timeout):
        self.poll_calls += 1

    def produce(self, topic, value, callback):
        if self.raise_on_produce:
            raise self.raise_on_produce
        self.produced.append((topic, value, callback))

    def flush(self, timeout=None):
        self.flush_calls += 1
        return 0

    def __len__(self):
        return len(self.produced)


def test_kafka_producer_is_a_singleton():
    assert KafkaProducer() is kafka_producer
    assert KafkaProducer() is KafkaProducer()


def test_send_when_not_started_logs_and_skips(monkeypatch):
    monkeypatch.setattr(kafka_producer, "producer", None)
    # Just needs to not raise - nothing to assert on the (real) logger.
    kafka_producer.send("some.topic", {"a": 1})


def test_send_happy_path_calls_poll_then_produce(monkeypatch):
    fake = _FakeProducer()
    monkeypatch.setattr(kafka_producer, "producer", fake)

    kafka_producer.send("some.topic", {"a": 1})

    assert fake.poll_calls == 1
    assert len(fake.produced) == 1
    topic, value, callback = fake.produced[0]
    assert topic == "some.topic"
    assert json.loads(value.decode("utf-8")) == {"a": 1}
    assert callback == kafka_producer._delivery_report


def test_send_serializes_uuid_and_datetime_via_default_str(monkeypatch):
    fake = _FakeProducer()
    monkeypatch.setattr(kafka_producer, "producer", fake)

    an_id = uuid.uuid4()
    now = datetime.now(UTC)
    kafka_producer.send("some.topic", {"id": an_id, "at": now})

    _, value, _ = fake.produced[0]
    decoded = json.loads(value.decode("utf-8"))
    # default=str calls str(obj), not obj.isoformat() - space-separated,
    # not T-separated. Matters for a consumer trying to re-parse "at".
    assert decoded == {"id": str(an_id), "at": str(now)}


def test_send_buffer_error_is_caught_not_raised(monkeypatch):
    fake = _FakeProducer()
    fake.raise_on_produce = BufferError("queue full")
    monkeypatch.setattr(kafka_producer, "producer", fake)

    kafka_producer.send("some.topic", {"a": 1})  # must not raise


def test_send_generic_exception_is_caught_not_raised(monkeypatch):
    fake = _FakeProducer()
    fake.raise_on_produce = RuntimeError("librdkafka exploded")
    monkeypatch.setattr(kafka_producer, "producer", fake)

    kafka_producer.send("some.topic", {"a": 1})  # must not raise


def test_publish_event_wraps_send_in_the_standard_envelope(monkeypatch):
    fake = _FakeProducer()
    monkeypatch.setattr(kafka_producer, "producer", fake)

    kafka_producer.publish_event("some.topic", "something_happened", {"a": 1})

    _, value, _ = fake.produced[0]
    envelope = json.loads(value.decode("utf-8"))
    assert envelope["event_type"] == "something_happened"
    assert envelope["data"] == {"a": 1}
    assert "occurred_at" in envelope


def test_delivery_report_logs_error_on_failure(monkeypatch):
    logged = []
    monkeypatch.setattr(kafka_module.logger, "error", lambda msg: logged.append(msg))
    kafka_producer._delivery_report(err="boom", msg=None)
    assert any("boom" in m for m in logged)


def test_delivery_report_logs_info_on_success(monkeypatch):
    logged = []
    monkeypatch.setattr(kafka_module.logger, "info", lambda msg: logged.append(msg))

    class _Msg:
        def topic(self):
            return "some.topic"

        def partition(self):
            return 0

    kafka_producer._delivery_report(err=None, msg=_Msg())
    assert any("some.topic" in m for m in logged)


def test_stop_when_never_started_is_a_noop(monkeypatch):
    monkeypatch.setattr(kafka_producer, "producer", None)
    kafka_producer.stop()  # must not raise
    assert kafka_producer.producer is None


def test_stop_flushes_and_clears_producer(monkeypatch):
    fake = _FakeProducer()
    monkeypatch.setattr(kafka_producer, "producer", fake)

    kafka_producer.stop()

    assert fake.flush_calls == 1
    assert kafka_producer.producer is None


def test_kafka_consumer_is_a_singleton():
    assert KafkaConsumer() is kafka_consumer
    assert KafkaConsumer() is KafkaConsumer()


def test_consumer_start_returns_existing_instance_without_rebuilding(monkeypatch):
    sentinel = object()
    monkeypatch.setattr(kafka_consumer, "consumer", sentinel)

    assert kafka_consumer.start("some-group") is sentinel


def test_consumer_stop_when_never_started_is_a_noop(monkeypatch):
    monkeypatch.setattr(kafka_consumer, "consumer", None)
    kafka_consumer.stop()  # must not raise
    assert kafka_consumer.consumer is None


def test_consumer_stop_closes_and_clears(monkeypatch):
    closed = []

    class _FakeConsumer:
        def close(self):
            closed.append(True)

    monkeypatch.setattr(kafka_consumer, "consumer", _FakeConsumer())

    kafka_consumer.stop()

    assert closed == [True]
    assert kafka_consumer.consumer is None
