import uuid
from datetime import datetime

from sqlmodel import SQLModel

from backend.models.notifications import NotificationType
from backend.schemas.common import PaginationMeta


class NotificationRead(SQLModel):
    id: uuid.UUID
    type: NotificationType
    title: str
    body: str | None
    link_url: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(SQLModel):
    data: list[NotificationRead]
    meta: PaginationMeta
    unread_count: int


class UnreadCountResponse(SQLModel):
    unread_count: int
