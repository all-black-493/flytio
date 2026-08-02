"""Notification persistence + live delivery, always together: every
producer site goes through create_notification/notify_staff below, never
inserts a Notification row directly - that's what guarantees a
persisted notification always also gets published (and vice versa)
without every call site having to remember both steps.
"""

import uuid

from sqlmodel import Session, func, select

from backend.models.notifications import Notification, NotificationType, utcnow
from backend.models.users import UserInDB
from backend.utils.log_manager import get_app_logger
from backend.utils.redis_client import publish_notification

logger = get_app_logger(__name__)


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
    confirmation emails (see crud/payments.py's _complete_booking).

    The live SSE push is best-effort: it's wrapped in its own try/except
    rather than the caller's, since by the time we'd publish, the row is
    already durably committed - a Redis hiccup should only cost the
    real-time push (the client still picks the notification up on its
    next GET /notifications or SSE reconnect), not make notification
    creation itself look like it failed.
    """
    notification = Notification(
        user_id=user_id, type=type, title=title, body=body, link_url=link_url
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    logger.info(
        "Created notification %s (%s) for user %s",
        notification.id,
        type.value,
        user_id,
    )
    try:
        await publish_notification(str(user_id), _notification_event(notification))
    except Exception:
        logger.warning(
            "Failed to publish live push for notification %s (user %s) - "
            "row is saved, only the real-time delivery was missed",
            notification.id,
            user_id,
            exc_info=True,
        )
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
    logger.info(
        "Notified %d staff user(s) of %s: %s", len(notifications), type.value, title
    )
    return notifications


def notifications_query(user_id: uuid.UUID):
    """Ordered statement behind GET /notifications - see
    crud/bookings.py's user_bookings_query on the id tiebreaker."""
    return (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    )


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
        logger.debug(
            "mark_read: no notification %s for user %s", notification_id, user_id
        )
        return None
    if notification.read_at is None:
        notification.read_at = utcnow()
        session.add(notification)
        session.commit()
        session.refresh(notification)
        logger.debug(
            "Marked notification %s read for user %s", notification_id, user_id
        )
    return notification


def mark_all_read(session: Session, user_id: uuid.UUID) -> int:
    unread = session.exec(
        select(Notification).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
    ).all()
    now = utcnow()
    for notification in unread:
        notification.read_at = now
        session.add(notification)
    session.commit()
    logger.info("Marked %d notification(s) read for user %s", len(unread), user_id)
    return len(unread)


def delete_notification(
    session: Session, user_id: uuid.UUID, notification_id: uuid.UUID
) -> bool:
    """Hard-deletes one notification, scoped to its owner - returns False
    (not an exception) for an unknown id or one belonging to someone
    else, so the router can turn that into a plain 404 either way without
    distinguishing the two cases to the caller."""
    notification = session.exec(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user_id
        )
    ).first()
    if notification is None:
        logger.debug(
            "delete_notification: no notification %s for user %s",
            notification_id,
            user_id,
        )
        return False
    session.delete(notification)
    session.commit()
    logger.info("Deleted notification %s for user %s", notification_id, user_id)
    return True
