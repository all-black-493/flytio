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
