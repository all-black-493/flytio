import uuid
from datetime import datetime

from sqlmodel import SQLModel

from backend.models.notifications import NotificationType


class NotificationRead(SQLModel):
    id: uuid.UUID
    type: NotificationType
    title: str
    body: str | None
    link_url: str | None
    read_at: datetime | None
    created_at: datetime


class UnreadCountResponse(SQLModel):
    unread_count: int
