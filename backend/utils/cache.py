import hashlib
import json
import os

import redis.asyncio as redis
from dotenv import load_dotenv
from redis.exceptions import RedisError

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)


def make_cache_key(prefix: str, payload: dict) -> str:
    """Build a deterministic cache key from a request payload."""
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()
    return f"{prefix}:{digest}"


async def get_cached(key: str) -> dict | None:
    try:
        cached = await redis_client.get(key)
    except RedisError as e:
        print(f"Redis get failed: {e}")
        return None
    return json.loads(cached) if cached else None


async def set_cached(key: str, value: dict, ttl_seconds: int) -> None:
    try:
        await redis_client.set(key, json.dumps(value), ex=ttl_seconds)
    except (RedisError, TypeError) as e:
        print(f"Redis set failed: {e}")
