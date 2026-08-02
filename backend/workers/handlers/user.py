"""Handlers for KafkaTopics.USER_EVENTS (backend/utils/constants.py)."""

from typing import Any

from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.email import SENDER_WELCOME, send_email_async

TOPIC = KafkaTopics.USER_EVENTS


async def _handle_user_registered(data: dict[str, Any]) -> None:
    email = data["email"]
    subject = "Welcome to flyt!"
    body_text = (
        f"Hello {email},\n\nThank you for registering with us. We are excited "
        f"to have you on board!"
    )
    await send_email_async(subject, [email], body_text, from_address=SENDER_WELCOME)


HANDLERS = {
    KafkaEventTypes.USER_REGISTERED: _handle_user_registered,
}
