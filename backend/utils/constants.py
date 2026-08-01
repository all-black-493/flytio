class KafkaTopics:
    USER_EVENTS = "user.events"
    SUPPORT_EVENTS = "support.events"
    BOOKING_EVENTS = "booking.events"


class KafkaEventTypes:
    USER_REGISTERED = "user_registered"
    SUPPORT_REQUEST_RECEIVED = "support_request_received"
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_FAILED = "booking_failed"
    DISCOUNT_REDEMPTION_FAILED = "discount_redemption_failed"
    BOOKING_CANCELLED = "booking_cancelled"
    BOOKING_CHANGE_CONFIRMED = "booking_change_confirmed"
    AIRLINE_CHANGE_DETECTED = "airline_change_detected"
