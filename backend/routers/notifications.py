import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_pagination.ext.sqlalchemy import paginate
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from backend.crud.db import get_session
from backend.crud.notifications import (
    count_unread,
    delete_notification,
    mark_all_read,
    mark_read,
    notifications_query,
)
from backend.models.users import UserInDB
from backend.schemas.notifications import NotificationRead, UnreadCountResponse
from backend.utils.log_manager import get_app_logger
from backend.utils.pagination import cursor_page
from backend.utils.redis_client import notification_streamer
from backend.utils.security import get_current_user

logger = get_app_logger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/stream")
async def stream_notifications(current_user: UserInDB = Depends(get_current_user)):
    """Server-Sent-Events stream of the signed-in user's own notifications.

    No user_id path/query param by design - the stream is always scoped
    to whoever the auth cookie/bearer token actually belongs to, never a
    caller-supplied id (a bare `/notifications/{user_id}` would let any
    signed-in user snoop anyone else's notifications by changing the URL).
    Works identically for a regular customer and a staff/admin account;
    which events a given user receives is decided by who
    publish_notification() is called for (crud/notifications.py), not by
    this endpoint. Live-only: a fresh page load still needs GET
    /notifications below for anything that arrived before the stream
    connected.

    No try/except here: by the time this returns, the 200 and SSE headers
    are already on the wire, so a failure inside the generator (a dropped
    Redis connection, say) can't be turned into a different HTTP status
    any more - notification_streamer's own finally block (utils/
    redis_client.py) handles cleanup instead.
    """
    logger.info("Opening notification stream for user %s", current_user.id)
    return StreamingResponse(
        notification_streamer(str(current_user.id)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Disables response buffering on nginx-fronted deployments -
            # without this, an SSE stream can sit fully buffered and
            # never reach the browser until the connection closes.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("", **cursor_page(NotificationRead))
async def list_my_notifications(
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The signed-in user's own notifications, most recent first - backs
    the bell icon's panel on initial load/refresh; the SSE stream above
    only covers what arrives while it's connected.

    The unread count is deliberately not here - GET /notifications/
    unread-count already serves it, and that is where every caller reads
    it from, so computing it again on each list call was pure waste.
    """
    try:
        return paginate(session, notifications_query(current_user.id))
    except Exception as e:
        logger.exception("Failed to list notifications for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Couldn't load notifications.",
        ) from e


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cheap standalone poll for the bell icon's badge - avoids fetching
    the full notification list just to know if the count changed."""
    try:
        unread_count = count_unread(session, current_user.id)
    except Exception as e:
        logger.exception(
            "Failed to count unread notifications for user %s", current_user.id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Couldn't load the unread count.",
        ) from e
    return UnreadCountResponse(unread_count=unread_count)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    try:
        notification = mark_read(session, current_user.id, notification_id)
    except Exception as e:
        logger.exception(
            "Failed to mark notification %s read for user %s",
            notification_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Couldn't mark this notification read.",
        ) from e
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    return notification


@router.post("/read-all")
async def mark_all_notifications_read(
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    try:
        updated = mark_all_read(session, current_user.id)
    except Exception as e:
        logger.exception(
            "Failed to mark all notifications read for user %s", current_user.id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Couldn't mark your notifications read.",
        ) from e
    return {"message": f"Marked {updated} notification(s) as read."}


@router.delete("/{notification_id}")
async def delete_notification_route(
    notification_id: uuid.UUID,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Hard-deletes one of the signed-in user's own notifications. Scoped
    to the owner the same way mark_notification_read is - a 404 either
    way for an unknown id or someone else's, never a 403 that would
    confirm the id exists at all."""
    try:
        deleted = delete_notification(session, current_user.id, notification_id)
    except Exception as e:
        logger.exception(
            "Failed to delete notification %s for user %s",
            notification_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Couldn't delete this notification.",
        ) from e
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    return {"message": "Notification deleted."}
