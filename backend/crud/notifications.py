"""Notification persistence + live delivery, always together: every
producer site goes through create_notification/notify_staff below, never
inserts a Notification row directly - that's what guarantees a
persisted notification always also gets published (and vice versa)
without every call site having to remember both steps.
"""

import uuid
from datetime import datetime

from sqlmodel import Session, func, select

from backend.models.notifications import Notification, NotificationType
from backend.models.users import UserInDB
from backend.utils.redis_client import publish_notification


def _notification_event(notification: Notification) -> dict:
    """The exact payload pushed over SSE - shaped so the frontend can
    render it directly from the push without an extra fetch (see
    schemas/notifications.py's NotificationRead, which this mirrors)."""
    return {
        "id": str(notification.id),
        "type": notification.type.value,
        "title": notification.title,
        "body": notification.body,
        "link_url": notification.link_url,
        "read_at": None,
        "created_at": notification.created_at.isoformat(),
    }


async def create_notification(
    session: Session,
    *,
    user_id: uuid.UUID,
    type: NotificationType,
    title: str,
    body: str | None = None,
    link_url: str | None = None,
) -> Notification:
    """The one path every customer-facing producer site uses. Commits
    immediately (not batched with the caller's own transaction) so a
    notification survives even if something the caller does afterwards
    fails - matches this codebase's existing posture on side effects like
    confirmation emails (see crud/payments.py's _complete_booking)."""
    notification = Notification(
        user_id=user_id, type=type, title=title, body=body, link_url=link_url
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    await publish_notification(str(user_id), _notification_event(notification))
    return notification


async def notify_staff(
    session: Session,
    *,
    type: NotificationType,
    title: str,
    body: str | None = None,
    link_url: str | None = None,
) -> list[Notification]:
    """Fans out one row per staff user (is_staff=True) - the admin-facing
    equivalent of create_notification, for events that aren't scoped to
    a single customer (a new support request, a failed discount
    redemption). There's no separate "broadcast" row/table: read state
    is naturally per-staff-member this way, at the cost of one row per
    recipient rather than one shared row."""
    staff_users = session.exec(select(UserInDB).where(UserInDB.is_staff)).all()
    notifications = []
    for staff_user in staff_users:
        notifications.append(
            await create_notification(
                session,
                user_id=staff_user.id,
                type=type,
                title=title,
                body=body,
                link_url=link_url,
            )
        )
    return notifications


def list_notifications(
    session: Session, user_id: uuid.UUID, *, limit: int = 20, offset: int = 0
) -> list[Notification]:
    query = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(query).all())


def count_unread(session: Session, user_id: uuid.UUID) -> int:
    query = select(func.count()).where(
        Notification.user_id == user_id, Notification.read_at.is_(None)
    )
    return session.exec(query).one()


def count_notifications(session: Session, user_id: uuid.UUID) -> int:
    query = select(func.count()).where(Notification.user_id == user_id)
    return session.exec(query).one()


def mark_read(
    session: Session, user_id: uuid.UUID, notification_id: uuid.UUID
) -> Notification | None:
    notification = session.exec(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user_id
        )
    ).first()
    if notification is None:
        return None
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        session.add(notification)
        session.commit()
        session.refresh(notification)
    return notification


def mark_all_read(session: Session, user_id: uuid.UUID) -> int:
    unread = session.exec(
        select(Notification).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
    ).all()
    now = datetime.utcnow()
    for notification in unread:
        notification.read_at = now
        session.add(notification)
    session.commit()
    return len(unread)
