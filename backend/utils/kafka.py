from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from confluent_kafka import Consumer, Producer

from backend.config import settings
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


class KafkaProducer:
    """Singleton fire-and-forget event publisher. Routers call `publish_event`
    and return immediately - the actual work (e.g. sending an email) happens
    out of the request path, in a separate consumer process
    (backend/workers/kafka_consumer.py)."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(KafkaProducer, cls).__new__(cls)
            cls._instance.producer = None
            cls._instance.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS

        return cls._instance

    def start(self):
        if self.producer:
            return

        conf = {
            "bootstrap.servers": self.bootstrap_servers,
            "client.id": "fastapi-producer",
            # Lets librdkafka safely retry a produce internally (e.g. after
            # a transient broker error) without risking a duplicate or
            # out-of-order write landing on the topic.
            "enable.idempotence": True,
            "acks": "all",
        }
        try:
            self.producer = Producer(conf)
            logger.info(f"Kafka producer started on {self.bootstrap_servers}")
        except Exception as e:
            logger.error(f"Failed to start Kafka producer: {e}")
            self.producer = None

    def stop(self):
        if self.producer:
            left = self.producer.flush(timeout=5.0)
            logger.info(f"Kafka producer stopped, {left} messages were not delivered")
            self.producer = None

    def _delivery_report(self, err, msg):
        if err:
            logger.error(f"Message delivery failed: {err}")
        else:
            logger.info(f"Message delivered to {msg.topic()} [{msg.partition()}]")

    def send(self, topic: str, message: dict[str, Any]):
        if not self.producer:
            logger.warning(
                f"Kafka producer is not initialized. Message to {topic} skipped"
            )
            return

        # Serves delivery-report callbacks queued by earlier produce() calls
        # before adding this message to the queue - the documented pattern
        # for a fire-and-forget producer (poll() never blocks with a 0
        # timeout, it only drains already-completed callbacks).
        self.producer.poll(0)
        try:
            # default=str covers the payload types that actually show up in
            # these events (UUID primary keys, datetimes, Decimals) without
            # every call site having to remember to stringify them first.
            value = json.dumps(message, default=str).encode("utf-8")
            self.producer.produce(
                topic=topic, value=value, callback=self._delivery_report
            )
        except BufferError:
            logger.error(
                f"Kafka local queue is full ({len(self.producer)} messages awaiting "
                f"delivery) - message to {topic} dropped"
            )
        except Exception as e:
            logger.error(f"Failed to send message to {topic}: {e}")

    def publish_event(self, topic: str, event_type: str, data: dict[str, Any]):
        """Wraps `send` in a consistent envelope so every consumer can rely
        on the same shape, instead of each call site inventing its own."""
        self.send(
            topic,
            {
                "event_type": event_type,
                "occurred_at": datetime.now(UTC).isoformat(),
                "data": data,
            },
        )


kafka_producer = KafkaProducer()


class KafkaConsumer:
    """Singleton wrapper around confluent_kafka.Consumer - mirrors
    KafkaProducer's start()/stop() shape above, so both halves of the
    client are owned by this one module rather than each call site (here,
    the one consumer process at backend/workers/kafka_consumer.py)
    building its own. A single process only ever needs one underlying
    Consumer regardless of how many times start() is called."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(KafkaConsumer, cls).__new__(cls)
            cls._instance.consumer = None
            cls._instance.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS

        return cls._instance

    def start(self, group_id: str) -> Consumer:
        if self.consumer:
            return self.consumer

        conf = {
            "bootstrap.servers": self.bootstrap_servers,
            "group.id": group_id,
            "auto.offset.reset": "earliest",
            # Committed explicitly by the caller after a message's handler
            # has run (success or logged failure), not on a timer - so a
            # crash mid-handler re-delivers the message instead of
            # silently skipping it.
            "enable.auto.commit": False,
        }
        self.consumer = Consumer(conf)
        logger.info(
            f"Kafka consumer started on {self.bootstrap_servers} (group={group_id})"
        )
        return self.consumer

    def stop(self):
        if self.consumer:
            self.consumer.close()
            logger.info("Kafka consumer stopped")
            self.consumer = None


kafka_consumer = KafkaConsumer()
