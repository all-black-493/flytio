"""Config-sanity tests for workers/handlers/__init__.py's composition -
not testing any one handler's behavior (see the per-domain
test_kafka_handlers_*.py files for that), just that every domain module
is wired in correctly: every KafkaEventTypes constant has exactly one
handler, and every KafkaTopics constant a domain module claims is
actually subscribed to."""

import inspect

from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.workers.handlers import (
    EVENT_HANDLERS,
    SUBSCRIBED_TOPICS,
    booking,
    payment,
    support,
    user,
)

_DOMAIN_MODULES = [user, support, booking, payment]

_ALL_EVENT_TYPES = {
    value
    for name, value in inspect.getmembers(KafkaEventTypes)
    if not name.startswith("_")
}
_ALL_TOPICS = {
    value for name, value in inspect.getmembers(KafkaTopics) if not name.startswith("_")
}


def test_every_event_type_has_exactly_one_handler():
    """Catches two mistakes at once: a new KafkaEventTypes constant added
    without a handler, and two domain modules accidentally handling the
    same event_type (the second would silently shadow the first in the
    dict merge, otherwise easy to miss)."""
    seen = set()
    for module in _DOMAIN_MODULES:
        overlap = seen & module.HANDLERS.keys()
        assert not overlap, (
            f"{module.__name__} redefines already-handled event types: {overlap}"
        )
        seen |= module.HANDLERS.keys()

    assert seen == _ALL_EVENT_TYPES


def test_every_domain_topic_is_subscribed():
    for module in _DOMAIN_MODULES:
        assert module.TOPIC in SUBSCRIBED_TOPICS


def test_subscribed_topics_are_all_known_topics():
    assert set(SUBSCRIBED_TOPICS) <= _ALL_TOPICS


def test_event_handlers_matches_domain_handlers_combined():
    combined = {}
    for module in _DOMAIN_MODULES:
        combined.update(module.HANDLERS)
    assert EVENT_HANDLERS == combined
