import hashlib
import json

import redis

from backend.config import settings
from backend.schemas.duffel_flights import OfferRequestCreate, PlaceSuggestionsQuery


class RedisCache:
    def __init__(self, host: str, port: int):
        self.r = redis.Redis(host=host, port=port, db=0, decode_responses=True)

    def set(self, key: str, value, expiration_seconds: int = 300):
        try:
            json_value = json.dumps(value)
            self.r.setex(key, expiration_seconds, json_value)
            print(f"Cached key: {key} for {expiration_seconds} seconds")
        except redis.exceptions.ConnectionError as e:
            print(f"Redis connection error: {e}")

    def get(self, key: str):
        try:
            json_value = self.r.get(key)
            if json_value:
                print(f"Cache hit for key: {key}")
                return json.loads(json_value)
            print(f"Cache miss for key: {key}")
            return None
        except redis.exceptions.ConnectionError as e:
            print(f"Redis connection error: {e}")
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


redis_cache = RedisCache(settings.REDIS_HOST, settings.REDIS_PORT)
