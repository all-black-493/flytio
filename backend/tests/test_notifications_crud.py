"""Unit tests for crud/notifications.py - persistence + fan-out only.
The Redis publish (utils/redis_client.py) is mocked out here, not
exercised for real: each test runs its own asyncio.run() (this repo's
convention, see e.g. test_payments.py), and redis.asyncio's client is a
module-level singleton bound to whichever event loop first used it -
reusing it across multiple asyncio.run() calls in the same process
raises "Event loop is closed" once the first loop's connection is torn
down. Production is unaffected (one continuous event loop for the app's
whole lifetime); this is purely a test-process artifact.
"""

import asyncio

import pytest
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
import backend.crud.notifications as notifications_crud
from backend.crud.notifications import (
    count_notifications,
    count_unread,
    create_notification,
    delete_notification,
    list_notifications,
    mark_all_read,
    mark_read,
    notify_staff,
)
from backend.crud.users import create_user
from backend.models.notifications import NotificationType, utcnow

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session(monkeypatch):
    async def fake_publish_notification(user_id, event):
        return None

    monkeypatch.setattr(
        notifications_crud, "publish_notification", fake_publish_notification
    )
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _user(session: Session, email: str, *, is_staff: bool = False):
    user = create_user(session, email=email, password="hashed")
    user.is_staff = is_staff
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_create_notification_persists_and_is_unread(session):
    user = _user(session, "customer@example.com")

    notification = asyncio.run(
        create_notification(
            session,
            user_id=user.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Booking ABC123 confirmed",
            body="Your flight is booked.",
            link_url="/account/bookings/1",
        )
    )

    assert notification.read_at is None
    assert count_unread(session, user.id) == 1
    assert count_notifications(session, user.id) == 1


def test_list_notifications_most_recent_first(session):
    user = _user(session, "customer2@example.com")
    first = asyncio.run(
        create_notification(
            session,
            user_id=user.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="First",
        )
    )
    second = asyncio.run(
        create_notification(
            session,
            user_id=user.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Second",
        )
    )

    notifications = list_notifications(session, user.id)

    assert [n.id for n in notifications] == [second.id, first.id]


def test_notify_staff_fans_out_to_every_staff_user_only(session):
    staff_one = _user(session, "staff1@example.com", is_staff=True)
    staff_two = _user(session, "staff2@example.com", is_staff=True)
    _user(session, "customer3@example.com", is_staff=False)

    notifications = asyncio.run(
        notify_staff(
            session,
            type=NotificationType.SUPPORT_REQUEST,
            title="New support request: help",
        )
    )

    recipient_ids = {n.user_id for n in notifications}
    assert recipient_ids == {staff_one.id, staff_two.id}
    assert count_unread(session, staff_one.id) == 1
    assert count_unread(session, staff_two.id) == 1


def test_mark_read_only_affects_owner_notification(session):
    owner = _user(session, "owner@example.com")
    other = _user(session, "other@example.com")
    notification = asyncio.run(
        create_notification(
            session,
            user_id=owner.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Booked",
        )
    )

    # Someone else's user_id can't mark it read - returns None, not the
    # notification, and the real owner's unread count is unaffected.
    assert mark_read(session, other.id, notification.id) is None
    assert count_unread(session, owner.id) == 1

    marked = mark_read(session, owner.id, notification.id)
    assert marked is not None
    assert marked.read_at is not None
    assert count_unread(session, owner.id) == 0


def test_mark_all_read_clears_every_unread_notification(session):
    user = _user(session, "customer4@example.com")
    for i in range(3):
        asyncio.run(
            create_notification(
                session,
                user_id=user.id,
                type=NotificationType.BOOKING_CONFIRMED,
                title=f"#{i}",
            )
        )

    updated = mark_all_read(session, user.id)

    assert updated == 3
    assert count_unread(session, user.id) == 0


def test_delete_notification_removes_it_and_is_scoped_to_owner(session):
    owner = _user(session, "owner3@example.com")
    other = _user(session, "other3@example.com")
    notification = asyncio.run(
        create_notification(
            session,
            user_id=owner.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Mine",
        )
    )

    # Someone else's user_id can't delete it - no-op, row still there.
    assert delete_notification(session, other.id, notification.id) is False
    assert count_notifications(session, owner.id) == 1

    assert delete_notification(session, owner.id, notification.id) is True
    assert count_notifications(session, owner.id) == 0

    # Deleting again (already gone) is a clean no-op, not an error.
    assert delete_notification(session, owner.id, notification.id) is False


def test_utcnow_is_timezone_aware_utc():
    """Guards the deprecated-datetime.utcnow() fix directly - crud/
    notifications.py's use of this same helper is covered indirectly by
    every test above (mark_read/mark_all_read both call it), but this
    checks the property itself: tzinfo present and actually UTC (offset
    zero), not just "some tzinfo or other"."""
    now = utcnow()

    assert now.tzinfo is not None
    assert now.utcoffset().total_seconds() == 0
