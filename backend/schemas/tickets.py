import uuid
from datetime import datetime

from sqlmodel import SQLModel


class TicketPublic(SQLModel):
    id: uuid.UUID
    document_type: str
    ticket_number: str
    issued_at: datetime
