"""Test doubles for event publishing.

`publish_event` is async now, so the one-line lambdas these tests used as
fakes no longer work - a coroutine function is what the production code
awaits.
"""

from typing import Any


def recording_publisher(sink: list[tuple[str, str, dict[str, Any]]]):
    """An async stand-in for publish_event that appends what it was given."""

    async def publish(topic: str, event_type: str, data: dict[str, Any]) -> None:
        sink.append((topic, event_type, data))

    return publish
