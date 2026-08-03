"""Router-level tests for routers/notifications.py - the REST endpoints
only (list/unread-count/mark-read/mark-all-read). The SSE stream itself
(GET /notifications/stream) isn't exercised here - TestClient doesn't
model a long-lived streaming connection well, and the endpoint's only
real logic (auth-gating, scoping to the authenticated user) is already
covered indirectly since it shares get_current_user with every other
endpoint tested below.
"""

import asyncio
from datetime import datetime

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.crud.notifications import create_notification
from backend.main import app
from backend.models.notifications import Notification, NotificationType
from backend.models.users import UserInDB
from backend.utils.security import create_access_token

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


def _override_get_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def db_client(api_client, monkeypatch):
    # Same reasoning as tests/test_notifications_crud.py: avoid a real
    # cross-asyncio.run() Redis publish inside a test.
    import backend.crud.notifications as notifications_crud

    async def fake_publish_notification(user_id, event):
        return None

    monkeypatch.setattr(
        notifications_crud, "publish_notification", fake_publish_notification
    )
    app.dependency_overrides[get_session] = _override_get_session
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _auth_headers(user: UserInDB) -> dict:
    token = create_access_token(data={"sub": user.email, "purpose": "access"})
    return {"Authorization": f"Bearer {token}"}


def _make_user(session: Session, **overrides) -> UserInDB:
    user = UserInDB(
        email=overrides.pop("email", "user@example.com"), password="hashed", **overrides
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_list_notifications_rejects_unauthenticated(db_client):
    response = db_client.get("/api/v1/notifications")
    assert response.status_code == 401


def test_list_notifications_returns_only_the_signed_in_users_own(session, db_client):
    owner = _make_user(session, email="owner@example.com")
    other = _make_user(session, email="other@example.com")
    asyncio.run(
        create_notification(
            session,
            user_id=owner.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Mine",
        )
    )
    asyncio.run(
        create_notification(
            session,
            user_id=other.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Not mine",
        )
    )

    response = db_client.get("/api/v1/notifications", headers=_auth_headers(owner))

    assert response.status_code == 200
    body = response.json()
    # total counts only this user's rows, not the other user's - the
    # unread count itself moved to GET /notifications/unread-count
    # (covered by test_unread_count_endpoint below).
    assert body["total"] == 1
    titles = [n["title"] for n in body["items"]]
    assert titles == ["Mine"]


def test_unread_count_endpoint(session, db_client):
    user = _make_user(session)
    asyncio.run(
        create_notification(
            session, user_id=user.id, type=NotificationType.BOOKING_CONFIRMED, title="A"
        )
    )

    response = db_client.get(
        "/api/v1/notifications/unread-count", headers=_auth_headers(user)
    )

    assert response.status_code == 200
    assert response.json() == {"unread_count": 1}


def test_mark_notification_read_rejects_someone_elses_notification(session, db_client):
    owner = _make_user(session, email="owner2@example.com")
    other = _make_user(session, email="other2@example.com")
    notification = asyncio.run(
        create_notification(
            session,
            user_id=owner.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Mine",
        )
    )

    response = db_client.post(
        f"/api/v1/notifications/{notification.id}/read", headers=_auth_headers(other)
    )

    assert response.status_code == 404


def test_mark_notification_read_end_to_end(session, db_client):
    user = _make_user(session)
    notification = asyncio.run(
        create_notification(
            session,
            user_id=user.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Mine",
        )
    )

    response = db_client.post(
        f"/api/v1/notifications/{notification.id}/read", headers=_auth_headers(user)
    )

    assert response.status_code == 200
    assert response.json()["read_at"] is not None
    unread = db_client.get(
        "/api/v1/notifications/unread-count", headers=_auth_headers(user)
    )
    assert unread.json() == {"unread_count": 0}


def test_mark_all_read_end_to_end(session, db_client):
    user = _make_user(session)
    for i in range(3):
        asyncio.run(
            create_notification(
                session,
                user_id=user.id,
                type=NotificationType.BOOKING_CONFIRMED,
                title=f"#{i}",
            )
        )

    response = db_client.post(
        "/api/v1/notifications/read-all", headers=_auth_headers(user)
    )

    assert response.status_code == 200
    unread = db_client.get(
        "/api/v1/notifications/unread-count", headers=_auth_headers(user)
    )
    assert unread.json() == {"unread_count": 0}


def test_delete_notification_rejects_someone_elses_notification(session, db_client):
    owner = _make_user(session, email="owner3@example.com")
    other = _make_user(session, email="other3@example.com")
    notification = asyncio.run(
        create_notification(
            session,
            user_id=owner.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Mine",
        )
    )

    response = db_client.delete(
        f"/api/v1/notifications/{notification.id}", headers=_auth_headers(other)
    )

    assert response.status_code == 404


def test_delete_notification_end_to_end(session, db_client):
    user = _make_user(session)
    notification = asyncio.run(
        create_notification(
            session,
            user_id=user.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Mine",
        )
    )

    response = db_client.delete(
        f"/api/v1/notifications/{notification.id}", headers=_auth_headers(user)
    )
    assert response.status_code == 200

    listing = db_client.get("/api/v1/notifications", headers=_auth_headers(user))
    assert listing.json()["items"] == []

    # Deleting again 404s - it's already gone.
    again = db_client.delete(
        f"/api/v1/notifications/{notification.id}", headers=_auth_headers(user)
    )
    assert again.status_code == 404


def test_cursor_paging_visits_every_row_exactly_once(session, db_client):
    """The property cursor pagination exists to guarantee, and the one
    OFFSET quietly breaks on a busy list: walking every page must yield
    each row exactly once - no skips, no repeats.

    All seven rows share one created_at on purpose. That is the case a
    lone `ORDER BY created_at DESC` cannot survive, because ties leave
    the cursor's position ambiguous; the (created_at, id) ordering in
    crud/notifications.py's notifications_query is what makes it a total
    order and therefore safe to seek into.
    """
    user = _make_user(session)
    created_at = datetime(2026, 7, 1, 12, 0, 0)
    for i in range(7):
        session.add(
            Notification(
                user_id=user.id,
                type=NotificationType.BOOKING_CONFIRMED,
                title=f"n-{i}",
                created_at=created_at,
            )
        )
    session.commit()

    seen: list[str] = []
    cursor: str | None = None
    for _ in range(10):  # bounded so a paging bug fails instead of hanging
        query = f"?size=3&cursor={cursor}" if cursor else "?size=3"
        body = db_client.get(
            f"/api/v1/notifications{query}", headers=_auth_headers(user)
        ).json()
        assert body["total"] == 7
        seen.extend(n["title"] for n in body["items"])
        cursor = body["next_page"]
        if cursor is None:
            break
    else:
        pytest.fail("cursor paging did not terminate")

    assert sorted(seen) == [f"n-{i}" for i in range(7)]
    assert len(seen) == len(set(seen))
