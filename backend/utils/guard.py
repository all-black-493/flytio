"""fastapi-guard wiring, shared by main.py (middleware) and every router
that needs a per-route rate limit override (guard_deco.rate_limit).

Local protection (rate limiting, penetration detection) always runs.
fastapi-guard's hosted agent - the guard-core.com dashboard - is layered
on top and only turns on when GUARD_API_KEY is configured; see below.

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
from backend.utils.constants import HEALTH_PATHS
from backend.utils.log_manager import get_app_logger

try:
    from guard import __version__ as _GUARD_VERSION
except ImportError:  # pragma: no cover - only if fastapi-guard drops the attr
    _GUARD_VERSION = None

logger = get_app_logger(__name__)

# The hosted agent is all-or-nothing: SecurityConfig raises outright on
# enable_agent=True with no agent_api_key, so an unset GUARD_API_KEY would
# take the whole app down at import rather than just skipping telemetry.
# Gating on the key keeps an unconfigured environment (local, CI, a fresh
# clone) working with local protection only.
_agent_enabled = bool(settings.GUARD_API_KEY)
if _agent_enabled:
    logger.info("fastapi-guard agent enabled, reporting to %s", "api.guard-core.com")
    if not settings.GUARD_PROJECT_ID:
        logger.warning(
            "GUARD_API_KEY is set but GUARD_PROJECT_ID is not - events may not "
            "be attributed to a project in the guard-core dashboard"
        )

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
    # Health probes bypass every security check, because guard_core is
    # fail-secure: when Redis is unreachable it answers 500 to everything
    # rather than let a request through unchecked. That is right for the
    # API and catastrophic for a liveness probe - an orchestrator would
    # read "Redis is down" as "this process is wedged" and restart every
    # replica, none of which can start any faster than Redis recovers.
    # Excluding these paths keeps liveness answerable from the process
    # alone, which is the only thing it is meant to measure.
    #
    # Safe to leave open: routers/health.py returns dependency reachability
    # and nothing else, and it is already public and unauthenticated.
    exclude_paths=HEALTH_PATHS,
    # IP banning stays off deliberately: this API sits behind nginx and
    # serves users on shared/mobile NAT, where banning an address can take
    # out a whole network. Detection still runs (below) - it just reports
    # rather than blocks. Defaults to True in SecurityConfig, so it needs
    # an explicit False rather than being left unset.
    enable_ip_banning=False,
    enable_penetration_detection=True,
    blocked_user_agents=settings.BLOCKED_USER_AGENTS.split(","),
    auto_ban_threshold=settings.AUTO_BAN_THRESHOLD,
    auto_ban_duration=settings.AUTO_BAN_DURATION,
    custom_log_file=None,
    passive_mode=True,
    # agent_endpoint is omitted: https://api.guard-core.com is already its
    # default. The key and project id are passed as None rather than "" when
    # unset - the library checks for None, and an empty string would read as
    # "configured, with a blank key".
    enable_agent=_agent_enabled,
    agent_api_key=settings.GUARD_API_KEY or None,
    agent_project_id=settings.GUARD_PROJECT_ID or None,
    # Lets guard-core attribute events to the wrapper version, per its
    # integration guide.
    agent_guard_version=_GUARD_VERSION,
)

guard_deco = SecurityDecorator(security_config)
