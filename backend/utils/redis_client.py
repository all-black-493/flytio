"""Redis pub/sub for the notifications SSE stream (routers/notifications.py).

Separate from external_services/cache.py's RedisCache: that one is a
sync client used for GET-and-cache-the-response caching (search results,
seat maps, places); this one is an async client used for pub/sub, a
fundamentally different access pattern (long-lived subscription vs
request-scoped get/set). Both point at the same Redis instance/settings,
just via the client each usage actually needs.
"""

import json
from collections.abc import AsyncIterator

from redis import asyncio as aioredis

from backend.config import settings
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

redis = aioredis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, db=0)

# One channel per user, not one global channel - a bare "notifications"
# channel would deliver every user's (and every admin's) events to every
# open stream, which is both wrong (wrong recipient sees it) and a data
# leak (a customer could see another customer's booking events).
_USER_CHANNEL_PREFIX = "notifications:user:"


def _user_channel(user_id: str) -> str:
    return f"{_USER_CHANNEL_PREFIX}{user_id}"


async def publish_notification(user_id: str, event: dict) -> None:
    """Publishes one notification event to a single user's channel.
    `event` must be JSON-serializable - see schemas/notifications.py for
    the shape every producer should send. Raises on a Redis failure
    rather than swallowing it - the caller (crud/notifications.py's
    create_notification) is the one in a position to decide that's
    non-fatal (the row is already saved), not this low-level helper."""
    await redis.publish(_user_channel(user_id), json.dumps(event))
    logger.debug("Published notification event to %s", _user_channel(user_id))


async def notification_streamer(user_id: str) -> AsyncIterator[str]:
    """Yields Server-Sent-Events frames for one user's notifications.
    Only ever subscribed to that user's own channel - the caller
    (routers/notifications.py) must have already authenticated the
    request and passed the *authenticated* user's id, never a raw,
    unchecked path param.

    `get_message(timeout=...)` blocks on the connection for up to that
    many seconds and returns None on a real timeout (see redis-py's
    Connection.read_response) - no busy-poll loop, and no separate
    asyncio.wait_for needed around it. A None result becomes a periodic
    SSE comment frame (lines starting with ":" are ignored by SSE
    clients) purely to keep the connection alive through proxies/load
    balancers that drop an idle HTTP connection.

    A broken Redis connection mid-stream is logged and ends the
    generator cleanly (the client's EventSource reconnects on its own)
    rather than letting an unhandled exception blow up silently inside
    StreamingResponse, where there's no HTTP status left to change.
    """
    channel = _user_channel(user_id)
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)
    logger.info("Subscribed to %s", channel)
    try:
        while True:
            try:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=25.0
                )
            except Exception:
                logger.warning(
                    "Notification stream for %s lost its Redis connection",
                    channel,
                    exc_info=True,
                )
                return
            if message is None:
                yield ": keep-alive\n\n"
                continue
            yield f"data: {message['data'].decode()}\n\n"
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        logger.info("Unsubscribed from %s", channel)
