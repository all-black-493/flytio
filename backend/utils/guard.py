"""fastapi-guard wiring, shared by main.py (middleware) and every router
that needs a per-route rate limit override (guard_deco.rate_limit).

This is the app's only rate limiter - there is no separate per-email or
per-user limiter anymore. fastapi-guard's own rate limiter is IP-keyed
only (confirmed from its source: every check path in guard_core's
RateLimitCheck resolves to extract_client_ip - there's no hook for keying
by an authenticated user or a request field like email), so limits that
used to be deliberately keyed by something other than the caller's IP
(credential stuffing against one account regardless of source IP; an
authenticated action per account rather than per network) are now IP-only
too. Accepted trade-off for having exactly one rate-limiting mechanism in
the app.
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
    enable_penetration_detection=True,
    blocked_user_agents=settings.BLOCKED_USER_AGENTS.split(","),
    auto_ban_threshold=settings.AUTO_BAN_THRESHOLD,
    auto_ban_duration=settings.AUTO_BAN_DURATION,
    custom_log_file=None,
    passive_mode=True,
)

guard_deco = SecurityDecorator(security_config)
