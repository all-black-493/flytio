import hashlib
import json

import redis

from backend.config import settings
from backend.schemas.duffel_flights import OfferRequestCreate
from backend.schemas.duffel_places import PlaceSuggestionsQuery
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


class RedisCache:
    def __init__(self, url: str | None = None):
        # from_url, not Redis(host=..., port=...): the URL carries the
        # scheme, and the scheme is what selects TLS. Passing host/port
        # separately has no way to express that, so a TLS-only endpoint
        # would be connected to in plaintext and simply refuse.
        self.r = redis.Redis.from_url(url or settings.redis_url, decode_responses=True)

    def set(self, key: str, value, expiration_seconds: int = 300):
        try:
            json_value = json.dumps(value)
            self.r.setex(key, expiration_seconds, json_value)
            logger.debug("Cached key: %s for %ss", key, expiration_seconds)
        except redis.exceptions.ConnectionError as e:
            logger.warning("Redis connection error while caching %s: %s", key, e)

    def get(self, key: str):
        try:
            json_value = self.r.get(key)
            if json_value:
                logger.debug("Cache hit for key: %s", key)
                return json.loads(json_value)
            logger.debug("Cache miss for key: %s", key)
            return None
        except redis.exceptions.ConnectionError as e:
            logger.warning("Redis connection error while reading %s: %s", key, e)
            return None


def _hash_payload(payload: dict) -> str:
    """Deterministic digest of a JSON-able payload, independent of dict key
    ordering, so equivalent requests always land on the same cache slot."""
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()


def build_search_cache_key(request: OfferRequestCreate) -> str:
    """Cache key for a flight search, keyed on the full offer request body
    (slices, passengers, cabin_class, max_connections)."""
    payload = request.model_dump(mode="json", exclude_none=True)
    return f"flights:search:{_hash_payload(payload)}"


def build_seatmap_cache_key(offer_id: str) -> str:
    """Cache key for a seat map lookup, keyed directly on the offer_id."""
    return f"flights:seatmap:{offer_id}"


def build_places_cache_key(query: PlaceSuggestionsQuery) -> str:
    """Cache key for a places (airport/city) suggestion lookup, keyed on the
    full query (text query, or lat/lng/rad)."""
    payload = query.model_dump(mode="json", exclude_none=True)
    return f"places:suggestions:{_hash_payload(payload)}"


redis_cache = RedisCache()
