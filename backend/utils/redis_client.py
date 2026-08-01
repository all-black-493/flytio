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
    the shape every producer should send."""
    await redis.publish(_user_channel(user_id), json.dumps(event))


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
    """
    pubsub = redis.pubsub()
    await pubsub.subscribe(_user_channel(user_id))
    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=25.0
            )
            if message is None:
                yield ": keep-alive\n\n"
                continue
            yield f"data: {message['data'].decode()}\n\n"
    finally:
        await pubsub.unsubscribe(_user_channel(user_id))
        await pubsub.aclose()
