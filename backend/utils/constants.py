"""Cross-cutting constants shared by routers, workers and scripts."""

# Mount point for the versioned API (see main.py). Anything that has to
# name a full API path lives downstream of this: the OAuth redirect URI
# handed to Google, and the webhook/IPN URLs registered with Duffel and
# Pesapal. Those three are held by *external* systems, so a version bump
# is not just a code change - each has to be re-registered, and a stale
# one fails silently (Pesapal simply stops confirming payments). Keeping
# the prefix in one place at least means the code can't disagree with
# itself about where the API lives.
API_V1_PREFIX = "/api/v1"

# Health probes. Declared here rather than in routers/health.py because
# two unrelated places need to agree on them: the router, which serves
# them, and utils/guard.py, which must exempt them from security checks so
# a probe still answers when Redis is down.
#
# Every entry is listed under both mount points, since main.py serves the
# health router twice - versioned for the frontend, unversioned for probes
# and uptime monitors that are configured once and will not follow an
# /api/v2 later.
HEALTH_PREFIX = "/health"
_HEALTH_SUBPATHS = ("", "/live", "/ready")
HEALTH_PATHS = [
    f"{prefix}{sub}"
    for prefix in (HEALTH_PREFIX, f"{API_V1_PREFIX}{HEALTH_PREFIX}")
    for sub in _HEALTH_SUBPATHS
]


class KafkaTopics:
    USER_EVENTS = "user.events"
    SUPPORT_EVENTS = "support.events"
    # Booking-lifecycle events (cancel/change/airline-change) - published
    # by routers/bookings.py and routers/webhooks.py once the underlying
    # booking mutation has already committed.
    BOOKING_EVENTS = "booking.events"
    # Payment-outcome events - published by crud/payments.py's
    # _publish_booking_completion_events, after its own session.commit().
    # Kept separate from BOOKING_EVENTS despite also being
    # booking-shaped: these are produced from the payment/checkout flow
    # (keyed by payment_id), not a booking action a user/admin took
    # directly, and may warrant different retention/scaling later.
    PAYMENT_EVENTS = "payment.events"


class KafkaEventTypes:
    USER_REGISTERED = "user_registered"

    SUPPORT_REQUEST_RECEIVED = "support_request_received"

    # BOOKING_EVENTS
    BOOKING_CANCELLED = "booking_cancelled"
    BOOKING_CHANGE_CONFIRMED = "booking_change_confirmed"
    AIRLINE_CHANGE_DETECTED = "airline_change_detected"

    # PAYMENT_EVENTS
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_FAILED = "booking_failed"
    DISCOUNT_REDEMPTION_FAILED = "discount_redemption_failed"
