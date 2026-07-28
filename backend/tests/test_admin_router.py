"""Router-level tests for the staff/admin surface (routers/admin.py),
using the shared api_client fixture (conftest.py) with an in-memory
SQLite DB - same pattern as test_order_changes.py.
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.main import app
from backend.models.bookings import Booking, BookingStatus
from backend.models.rbac import Group, GroupPermission, Permission, UserGroup
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
def db_client(api_client):
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


def _make_booking(session: Session, user: UserInDB, reference: str) -> Booking:
    booking = Booking(
        user_id=user.id,
        duffel_order_id=f"ord_{reference}",
        booking_reference=reference,
        status=BookingStatus.CONFIRMED,
        total_amount="100.00",
        total_currency="USD",
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def test_admin_bookings_rejects_unauthenticated(db_client):
    response = db_client.get("/api/admin/bookings")
    assert response.status_code == 401


def test_admin_bookings_rejects_non_staff(session, db_client):
    user = _make_user(session)

    response = db_client.get("/api/admin/bookings", headers=_auth_headers(user))
    assert response.status_code == 403


def test_admin_bookings_rejects_staff_without_permission(session, db_client):
    user = _make_user(session, is_staff=True)

    response = db_client.get("/api/admin/bookings", headers=_auth_headers(user))
    assert response.status_code == 403


def test_admin_bookings_allows_staff_with_permission_via_group(session, db_client):
    """The actual point of the endpoint: a staff member with view_booking
    (granted through a group, not a direct grant) sees every booking in
    the system, including ones belonging to other users."""
    owner = _make_user(session, email="traveler@example.com")
    _make_booking(session, owner, "ABC123")

    staffer = _make_user(session, email="staffer@example.com", is_staff=True)
    group = Group(name="support")
    permission = Permission(
        codename="view_booking", name="Can view booking", content_type="booking"
    )
    session.add(group)
    session.add(permission)
    session.commit()
    session.refresh(group)
    session.refresh(permission)
    session.add(UserGroup(user_id=staffer.id, group_id=group.id))
    session.add(GroupPermission(group_id=group.id, permission_id=permission.id))
    session.commit()

    response = db_client.get("/api/admin/bookings", headers=_auth_headers(staffer))

    assert response.status_code == 200
    references = [b["booking_reference"] for b in response.json()["data"]]
    assert "ABC123" in references


def test_admin_bookings_allows_superuser_without_any_grant(session, db_client):
    _make_booking(session, _make_user(session), "XYZ789")
    superuser = _make_user(
        session, email="root@example.com", is_staff=True, is_superuser=True
    )

    response = db_client.get("/api/admin/bookings", headers=_auth_headers(superuser))
    assert response.status_code == 200


def test_group_management_rejects_non_superuser_staff(session, db_client):
    staffer = _make_user(session, is_staff=True)

    response = db_client.post(
        "/api/admin/groups", json={"name": "ops"}, headers=_auth_headers(staffer)
    )
    assert response.status_code == 403


def test_group_management_end_to_end_for_superuser(session, db_client):
    seed = Permission(
        codename="view_booking", name="Can view booking", content_type="booking"
    )
    session.add(seed)
    session.commit()

    superuser = _make_user(
        session, email="root2@example.com", is_staff=True, is_superuser=True
    )
    target = _make_user(session, email="agent@example.com", is_staff=True)
    headers = _auth_headers(superuser)

    create_response = db_client.post(
        "/api/admin/groups", json={"name": "support"}, headers=headers
    )
    assert create_response.status_code == 200
    group_id = create_response.json()["id"]

    assign_perm_response = db_client.post(
        f"/api/admin/groups/{group_id}/permissions",
        json={"codenames": ["view_booking"]},
        headers=headers,
    )
    assert assign_perm_response.status_code == 200
    assert assign_perm_response.json()["permissions"] == ["view_booking"]

    assign_user_response = db_client.post(
        f"/api/admin/users/{target.id}/groups",
        json={"group_ids": [group_id]},
        headers=headers,
    )
    assert assign_user_response.status_code == 200

    # The freshly-assigned group's permission now works for `target`.
    target_response = db_client.get(
        "/api/admin/bookings", headers=_auth_headers(target)
    )
    assert target_response.status_code == 200
