"""Simple Redis-backed fixed-window rate limiter, reusing the same Redis
instance as external_services/cache.py's RedisCache (REDIS_HOST/REDIS_PORT)
rather than standing up new infra.

Per-IP rate limiting is handled by fastapi-guard instead (see utils/guard.py
and its guard_deco.rate_limit route decorators) - this module now only
covers limits keyed by something fastapi-guard can't express: an email
address (guards one account against credential stuffing regardless of
source IP) or an authenticated user id (checkout, change-password,
delete-account).
"""

import redis
from fastapi import HTTPException, status

from backend.external_services.cache import redis_cache
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


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
        logger.warning(
            "Redis rate-limit check failed for key %s, allowing request: %s", key, e
        )
        return False


def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Raises 429 if `key` is over its limit - the single place every
    rate-limited endpoint's "check is_rate_limited, then raise
    HTTPException(429, ...)" boilerplate lives, instead of each router
    repeating the same four lines with its own limit/window constants."""
    if is_rate_limited(key, limit=limit, window_seconds=window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
