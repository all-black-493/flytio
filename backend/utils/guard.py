"""fastapi-guard wiring, shared by main.py (middleware) and every router
that needs a per-route rate limit override (guard_deco.rate_limit).

fastapi-guard's rate limiter is IP-keyed only (see extract_client_ip in the
library) - it has no notion of "per authenticated user" or "per email
address". It replaces every rate limit in this app that was IP-only
(registration, the IP leg of login/forgot-password, password reset,
flight search/pricing). The limits that were deliberately keyed by
something other than the caller's IP - per-email (guards one account
against credential stuffing regardless of source IP) or per-user (guards
an authenticated action per account) - still go through
utils/rate_limit.py's enforce_rate_limit, which fastapi-guard can't
express.
"""

from guard import SecurityConfig, SecurityDecorator

from backend.config import settings

security_config = SecurityConfig(
    # Generous backstop for every route that doesn't have its own
    # @guard_deco.rate_limit override below - most of the API (booking
    # detail views, cancellations, ticket lookups, etc.) had no rate limit
    # at all before this.
    rate_limit=300,
    rate_limit_window=60,
    enable_rate_limiting=True,
    enable_redis=True,
    redis_url=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    # Every other fastapi-guard feature is off - this app is opting into
    # rate limiting only, not the rest of the security suite. Both of
    # these default to True in SecurityConfig, so they need an explicit
    # False here rather than just being left unset.
    enable_ip_banning=False,
    enable_penetration_detection=False,
)

guard_deco = SecurityDecorator(security_config)
