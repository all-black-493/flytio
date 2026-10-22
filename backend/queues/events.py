"""The queue subscriber: one consumer for every event this app publishes.

Vercel compiles this into a private, queue-triggered function at build time -
no public URL, invokable only by the queue infrastructure. The module path is
declared under [[tool.vercel.subscribers]] in the root pyproject.toml.

It replaces the Kafka consumer's poll loop. The dispatch is the same table
that loop used, so the handlers in workers/handlers/ are untouched.

Nothing but the queue SDK and the standard library is imported at module
scope, and that is load-bearing: Vercel introspects this module at build time
with `uv run --no-sync` against the repository root, where only the SDK is
installed. The handler table pulls in SQLModel and Resend; the app's own
logger pulls in pydantic through the settings module. Either at module scope
fails the build before it reaches a deployment, so both are deferred to call
time - which also keeps the subscriber's cold start to what it needs.
"""

import logging
from typing import Any

from vercel.queue import Message, subscribe

# Deliberately the standard library, not backend.utils.log_manager: that
# reaches backend.config, which is pydantic, which build-time introspection
# does not have. Vercel captures stdlib logging from functions anyway.
logger = logging.getLogger(__name__)

# A permanently failing message would otherwise be redelivered until it
# expires. Five attempts rides out a provider blip without hammering it, and
# for this kind of work - an email, a notification row - a sixth is not going
# to be the one that succeeds.
MAX_ATTEMPTS = 5


def _handlers() -> dict[str, Any]:
    """The dispatch table, resolved at call time. See the module docstring."""
    from backend.workers.handlers import EVENT_HANDLERS

    return EVENT_HANDLERS


@subscribe(topic="*", max_attempts=MAX_ATTEMPTS)
async def handle_event(message: Message[dict[str, Any]]) -> None:
    """Dispatch one event to its handler.

    Unlike the Kafka consumer, which logged a failure and committed past it,
    an exception here means redelivery. That is the better default: a handler
    that failed because Resend was briefly down should run again. An event
    with no handler is not that, so it is logged and accepted rather than
    retried against a dispatch table that will never grow one mid-flight.
    """
    envelope = message.payload or {}
    event_type = envelope.get("event_type")

    handler = _handlers().get(event_type)
    if handler is None:
        logger.warning("No handler for event_type=%r, dropping", event_type)
        return

    await handler(envelope.get("data", {}))
