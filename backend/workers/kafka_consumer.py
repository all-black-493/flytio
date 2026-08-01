"""Long-running consumer for the events published by utils/kafka.py -
the other half of the fire-and-forget producer. Runs as its own process
(see compose.yaml's kafka-consumer service), never imported by the
FastAPI app itself:

    python -m backend.workers.kafka_consumer

Per-domain event handlers live in workers/handlers/ (one module per
topic) - this file only owns the poll loop, commit, and graceful
shutdown. Add a new event there, not here.
"""

from __future__ import annotations

import asyncio
import json
import signal

from backend.utils.kafka import kafka_consumer as kafka_client
from backend.utils.log_manager import get_app_logger
from backend.workers.handlers import EVENT_HANDLERS, SUBSCRIBED_TOPICS

logger = get_app_logger(__name__)

CONSUMER_GROUP_ID = "flyt-backend-workers"


def main() -> None:
    consumer = kafka_client.start(CONSUMER_GROUP_ID)
    consumer.subscribe(SUBSCRIBED_TOPICS)

    running = True

    def _stop(signum, _frame):
        nonlocal running
        logger.info(f"Received signal {signum}, shutting down consumer")
        running = False

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    logger.info(f"Kafka consumer started, subscribed to {SUBSCRIBED_TOPICS}")
    try:
        while running:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error(f"Consumer error: {msg.error()}")
                continue

            try:
                envelope = json.loads(msg.value().decode("utf-8"))
                event_type = envelope.get("event_type")
                handler = EVENT_HANDLERS.get(event_type)
                if handler is None:
                    logger.warning(
                        f"No handler for event_type={event_type!r}, skipping"
                    )
                else:
                    asyncio.run(handler(envelope.get("data", {})))
            except Exception as e:
                # Logged and committed past, not retried forever - matches
                # the previous BackgroundTasks behavior, where a failed
                # side effect (email, notification) never blocked or
                # retried against the original request.
                logger.error(f"Failed to process message from {msg.topic()}: {e}")

            consumer.commit(msg)
    finally:
        kafka_client.stop()


if __name__ == "__main__":
    main()
