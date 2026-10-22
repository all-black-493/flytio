"""Publishing domain events.

Replaces the Kafka producer this app used to run alongside itself. The
envelope and the topic names are unchanged, so the handlers in
workers/handlers/ did not have to move: only the transport did.

Publishing is best-effort by design, exactly as it was before. A booking that
succeeded must not fail because the thing that sends its confirmation email
was briefly unreachable - the event is logged and dropped instead, and the
caller carries on.
"""

from datetime import UTC, datetime
from typing import Any

from vercel.queue import send

from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


def build_envelope(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """The shape every handler reads. Kept identical to the Kafka envelope."""
    return {
        "event_type": event_type,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": data,
    }


async def publish_event(topic: str, event_type: str, data: dict[str, Any]) -> None:
    """Publish one event, swallowing any failure to reach the queue.

    `default=str` in the Kafka version covered UUIDs, datetimes and Decimals
    without every call site remembering to stringify them. The queue SDK
    serialises to JSON the same way, so the same coercion is applied here
    rather than left to each producer.
    """
    envelope = build_envelope(event_type, _jsonable(data))
    try:
        message_id = await send(topic, envelope)
        logger.info("Published %s to %s (message %s)", event_type, topic, message_id)
    except Exception:
        # Deliberately broad: the queue being unreachable is not a reason to
        # fail the booking, payment or registration that produced the event.
        logger.exception("Failed to publish %s to %s", event_type, topic)


def _jsonable(value: Any) -> Any:
    """UUIDs, datetimes and Decimals, coerced the way json.dumps(default=str) did."""
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    return str(value)
