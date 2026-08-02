"""Handlers for KafkaTopics.SUPPORT_EVENTS (backend/utils/constants.py)."""

from typing import Any

from sqlmodel import Session

from backend.crud.db import engine
from backend.crud.notifications import notify_staff
from backend.models.notifications import NotificationType
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.email import (
    SENDER_SUPPORT,
    SENDER_TRANSACTIONAL,
    send_html_email_async,
)
from backend.utils.email_templates import (
    support_autoreply_email_html,
    support_request_email_html,
)

TOPIC = KafkaTopics.SUPPORT_EVENTS


async def _handle_support_request_received(data: dict[str, Any]) -> None:
    name = data["name"]
    email = data["email"]
    subject = data["subject"]
    message = data["message"]
    booking_reference = data.get("booking_reference")

    await send_html_email_async(
        f"Support: {subject}",
        [SENDER_SUPPORT],
        support_request_email_html(name, email, subject, message, booking_reference),
        from_address=SENDER_TRANSACTIONAL,
        reply_to=email,
    )
    await send_html_email_async(
        "We've received your message",
        [email],
        support_autoreply_email_html(name, subject),
        from_address=SENDER_SUPPORT,
    )
    # notify_staff/create_notification commit per-row internally (see
    # crud/notifications.py) - no explicit commit needed here.
    with Session(engine) as session:
        await notify_staff(
            session,
            type=NotificationType.SUPPORT_REQUEST,
            title=f"New support request: {subject}",
            body=f"Booking reference: {booking_reference}"
            if booking_reference
            else None,
            link_url="/admin",
        )


HANDLERS = {
    KafkaEventTypes.SUPPORT_REQUEST_RECEIVED: _handle_support_request_received,
}
