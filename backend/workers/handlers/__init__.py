"""Combines each domain module's TOPIC/HANDLERS into the two things the
consumer runner (backend/workers/kafka_consumer.py) actually needs:
which topics to subscribe to, and where to dispatch each event_type.

Adding a new domain (e.g. a future ticket.events) means adding its
module to _DOMAIN_MODULES below - the runner itself never changes."""

from backend.workers.handlers import booking, payment, support, user

_DOMAIN_MODULES = [user, support, booking, payment]

EVENT_HANDLERS = {}
for _module in _DOMAIN_MODULES:
    EVENT_HANDLERS.update(_module.HANDLERS)

SUBSCRIBED_TOPICS = sorted({_module.TOPIC for _module in _DOMAIN_MODULES})
