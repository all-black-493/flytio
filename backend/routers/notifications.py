import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from backend.crud.db import get_session
from backend.crud.notifications import (
    count_notifications,
    count_unread,
    list_notifications,
    mark_all_read,
    mark_read,
)
from backend.models.users import UserInDB
from backend.schemas.common import PaginationMeta
from backend.schemas.notifications import (
    NotificationListResponse,
    NotificationRead,
    UnreadCountResponse,
)
from backend.utils.redis_client import notification_streamer
from backend.utils.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


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
    """
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


@router.get("", response_model=NotificationListResponse)
async def list_my_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The signed-in user's own notifications, most recent first - backs
    the bell icon's panel on initial load/refresh; the SSE stream above
    only covers what arrives while it's connected."""
    notifications = list_notifications(
        session, current_user.id, limit=limit, offset=offset
    )
    total = count_notifications(session, current_user.id)
    return NotificationListResponse(
        data=notifications,
        meta=PaginationMeta(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
        unread_count=count_unread(session, current_user.id),
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cheap standalone poll for the bell icon's badge - avoids fetching
    the full notification list just to know if the count changed."""
    return UnreadCountResponse(unread_count=count_unread(session, current_user.id))


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notification = mark_read(session, current_user.id, notification_id)
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
    updated = mark_all_read(session, current_user.id)
    return {"message": f"Marked {updated} notification(s) as read."}
