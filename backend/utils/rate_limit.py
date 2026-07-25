"""Simple Redis-backed fixed-window rate limiter, reusing the same Redis
instance as external_services/cache.py's RedisCache (REDIS_HOST/REDIS_PORT)
rather than standing up new infra.
"""

import redis

from backend.external_services.cache import redis_cache


def is_rate_limited(key: str, limit: int, window_seconds: int) -> bool:
    """Returns True if `key` has already hit `limit` requests within the
    current `window_seconds` window, incrementing its count as a side
    effect. Fails open (returns False) if Redis is unreachable, matching
    RedisCache's existing fail-open behavior - a rate limiter that takes a
    feature down when Redis hiccups is worse than no rate limiter."""
    try:
        count = redis_cache.r.incr(key)
        if count == 1:
            redis_cache.r.expire(key, window_seconds)
        return count > limit
    except redis.exceptions.RedisError as e:
        print(f"Redis rate-limit check failed for key {key}, allowing request: {e}")
        return False
