"""Long-running consumer for the events published by utils/kafka.py -
the other half of the fire-and-forget producer. Runs as its own process
(see compose.yaml's kafka-consumer service), never imported by the
FastAPI app itself:

    python -m backend.workers.kafka_consumer

Per-domain event handlers live in workers/handlers/ (one module per
topic) - this file only owns the poll loop, commit, graceful shutdown,
and the periodic sweeps below. Add a new event there, not here.

It also hosts time-triggered work (workers/reminders.py), because this is
the one long-running process the app already owns. The poll loop wakes up
every second regardless of traffic, which makes it a serviceable timer
without adding a scheduler.
"""

from __future__ import annotations

import asyncio
import json
import signal
import time

from backend.utils.kafka import kafka_consumer as kafka_client
from backend.utils.log_manager import get_app_logger
from backend.workers.handlers import EVENT_HANDLERS, SUBSCRIBED_TOPICS
from backend.workers.reminders import send_due_departure_reminders

logger = get_app_logger(__name__)

CONSUMER_GROUP_ID = "flyt-backend-workers"

# How often the departure-reminder sweep runs. This is also the sweep's
# worst-case lateness: a reminder goes out somewhere in [LEAD_TIME,
# LEAD_TIME + this] before departure, never after it - so it still keeps
# the "at least 3 hours" promise, and "about 3 hours" stays honest.
#
# Fifteen minutes rather than five because the database is serverless
# (Neon), which suspends its compute after ~5 minutes without a query and
# bills for the time it's awake. A sweep every five minutes would reset
# that timer forever and hold the compute on 24/7 for the sake of a
# handful of emails a day.
REMINDER_SWEEP_INTERVAL_SECONDS = 900


def _run_periodic_sweeps(last_run: float) -> float:
    """Runs the due sweeps if their interval has elapsed, returning the
    new watermark. Monotonic, not wall-clock, so a clock adjustment can't
    make the loop either spin or stall.

    Failures are logged and swallowed: a sweep that raises must not take
    down the Kafka consumer this process primarily exists to be.
    """
    now = time.monotonic()
    if now - last_run < REMINDER_SWEEP_INTERVAL_SECONDS:
        return last_run
    try:
        asyncio.run(send_due_departure_reminders())
    except Exception:
        logger.exception("Departure-reminder sweep failed")
    return now


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
    # Sweeps on the next tick rather than immediately at boot, so a crash
    # loop can't hammer the mail provider with a sweep per restart.
    last_sweep = time.monotonic()
    try:
        while running:
            msg = consumer.poll(1.0)
            last_sweep = _run_periodic_sweeps(last_sweep)
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
