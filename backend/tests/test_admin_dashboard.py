"""Router-level tests for the admin dashboard/user-management endpoints
added on top of last turn's RBAC framework (routers/admin.py) - same
api_client + db_client dependency-override pattern as
tests/test_admin_router.py.
"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.main import app
from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.payments import Payment, PaymentProvider, PaymentStatus
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


def _grant(session: Session, user: UserInDB, *codenames: str) -> None:
    group = Group(name=f"grant-{user.id}")
    session.add(group)
    session.commit()
    session.refresh(group)
    session.add(UserGroup(user_id=user.id, group_id=group.id))
    for codename in codenames:
        permission = session.exec(
            select(Permission).where(Permission.codename == codename)
        ).first()
        if permission is None:
            permission = Permission(
                codename=codename, name=codename, content_type="test"
            )
            session.add(permission)
            session.commit()
            session.refresh(permission)
        session.add(GroupPermission(group_id=group.id, permission_id=permission.id))
    session.commit()


def _make_booking(
    session: Session,
    user: UserInDB,
    reference: str,
    *,
    created_at: datetime | None = None,
) -> Booking:
    booking = Booking(
        user_id=user.id,
        duffel_order_id=f"ord_{reference}",
        booking_reference=reference,
        status=BookingStatus.CONFIRMED,
        total_amount="100.00",
        total_currency="USD",
    )
    if created_at is not None:
        booking.created_at = created_at
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def _make_slice(
    session: Session, booking: Booking, origin: str, destination: str
) -> None:
    session.add(
        BookingSlice(
            booking_id=booking.id,
            duffel_slice_id=f"sli_{booking.id}_{origin}{destination}",
            origin_iata_code=origin,
            origin_city_name=f"{origin} City",
            destination_iata_code=destination,
            destination_city_name=f"{destination} City",
        )
    )
    session.commit()


def _make_payment(
    session: Session, user: UserInDB, amount: str, currency: str, status: PaymentStatus
) -> None:
    session.add(
        Payment(
            user_id=user.id,
            provider=PaymentProvider.PESAPAL,
            order_request_snapshot="{}",
            amount=amount,
            currency=currency,
            merchant_reference=f"ref-{user.id}-{amount}-{currency}-{status}",
            status=status,
        )
    )
    session.commit()


# ---------- dashboard summary ----------


def test_dashboard_summary_requires_both_booking_and_payment_permission(
    session, db_client
):
    staffer = _make_user(session, is_staff=True)
    _grant(session, staffer, "view_booking")  # missing view_payment

    response = db_client.get(
        "/api/v1/admin/dashboard/summary", headers=_auth_headers(staffer)
    )
    assert response.status_code == 403


def test_dashboard_summary_revenue_grouped_by_currency(session, db_client):
    owner = _make_user(session, email="traveler@example.com")
    _make_payment(session, owner, "100.00", "USD", PaymentStatus.COMPLETED)
    _make_payment(session, owner, "50.00", "USD", PaymentStatus.COMPLETED)
    _make_payment(session, owner, "5000.00", "KES", PaymentStatus.COMPLETED)
    _make_payment(session, owner, "999.00", "USD", PaymentStatus.FAILED)  # excluded

    staffer = _make_user(session, email="staffer@example.com", is_staff=True)
    _grant(session, staffer, "view_booking", "view_payment")

    response = db_client.get(
        "/api/v1/admin/dashboard/summary", headers=_auth_headers(staffer)
    )
    assert response.status_code == 200
    revenue = {
        row["currency"]: row["total_amount"] for row in response.json()["revenue"]
    }
    assert revenue == {"USD": "150.00", "KES": "5000.00"}


def test_dashboard_summary_active_users_only_counts_users_with_a_booking(
    session, db_client
):
    with_booking = _make_user(session, email="buyer@example.com")
    _make_booking(session, with_booking, "ABC123")
    _make_user(session, email="never-bought@example.com")

    staffer = _make_user(session, email="staffer2@example.com", is_staff=True)
    _grant(session, staffer, "view_booking", "view_payment")

    response = db_client.get(
        "/api/v1/admin/dashboard/summary", headers=_auth_headers(staffer)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["active_users"] == 1
    assert body["total_users"] == 3  # with_booking + never-bought + staffer


def test_dashboard_summary_bookings_today_and_this_week(session, db_client):
    owner = _make_user(session, email="traveler2@example.com")
    now = datetime.utcnow()
    _make_booking(session, owner, "TODAY1", created_at=now)
    _make_booking(session, owner, "OLD1", created_at=now - timedelta(days=30))

    staffer = _make_user(session, email="staffer3@example.com", is_staff=True)
    _grant(session, staffer, "view_booking", "view_payment")

    response = db_client.get(
        "/api/v1/admin/dashboard/summary", headers=_auth_headers(staffer)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["bookings_today"] == 1
    assert body["bookings_this_week"] >= 1
    assert body["total_bookings"] == 2


# ---------- popular routes ----------


def test_popular_routes_orders_by_count_and_respects_threshold(session, db_client):
    owner = _make_user(session)
    for _ in range(3):
        booking = _make_booking(session, owner, f"NBODXB{_}")
        _make_slice(session, booking, "NBO", "DXB")
    booking = _make_booking(session, owner, "NBOLHR")
    _make_slice(session, booking, "NBO", "LHR")

    staffer = _make_user(session, email="staffer4@example.com", is_staff=True)
    _grant(session, staffer, "view_booking")

    response = db_client.get(
        "/api/v1/admin/dashboard/popular-routes", headers=_auth_headers(staffer)
    )
    assert response.status_code == 200
    routes = response.json()
    assert routes[0]["origin_iata_code"] == "NBO"
    assert routes[0]["destination_iata_code"] == "DXB"
    assert routes[0]["booking_count"] == 3
    # staff view has min_bookings=1, so the single NBO->LHR booking is
    # still visible even though it wouldn't clear the public threshold.
    assert any(r["destination_iata_code"] == "LHR" for r in routes)


# ---------- user management ----------


def test_list_users_search_by_email(session, db_client):
    _make_user(session, email="alice@example.com")
    _make_user(session, email="bob@example.com")
    staffer = _make_user(session, email="staffer5@example.com", is_staff=True)
    _grant(session, staffer, "view_user")

    response = db_client.get(
        "/api/v1/admin/users",
        params={"search": "alice"},
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 200
    emails = [row["email"] for row in response.json()["items"]]
    assert emails == ["alice@example.com"]


def test_set_staff_requires_superuser(session, db_client):
    target = _make_user(session, email="target@example.com")
    staffer = _make_user(session, email="staffer6@example.com", is_staff=True)

    response = db_client.post(
        f"/api/v1/admin/users/{target.id}/staff",
        json={"is_staff": True},
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 403


def test_set_staff_works_for_superuser(session, db_client):
    target = _make_user(session, email="target2@example.com")
    superuser = _make_user(
        session, email="root@example.com", is_staff=True, is_superuser=True
    )

    response = db_client.post(
        f"/api/v1/admin/users/{target.id}/staff",
        json={"is_staff": True},
        headers=_auth_headers(superuser),
    )
    assert response.status_code == 200
    assert response.json()["is_staff"] is True


def test_deactivate_user_reuses_soft_delete_and_preserves_bookings(session, db_client):
    target = _make_user(session, email="deactivate-me@example.com")
    booking = _make_booking(session, target, "KEEPME")
    staffer = _make_user(session, email="staffer7@example.com", is_staff=True)
    _grant(session, staffer, "delete_user")

    response = db_client.post(
        f"/api/v1/admin/users/{target.id}/deactivate", headers=_auth_headers(staffer)
    )
    assert response.status_code == 200
    assert response.json()["email"] != "deactivate-me@example.com"

    session.expire_all()
    surviving = session.get(Booking, booking.id)
    assert surviving is not None
    assert surviving.booking_reference == "KEEPME"


def test_deactivate_user_rejects_self(session, db_client):
    staffer = _make_user(session, email="staffer8@example.com", is_staff=True)
    _grant(session, staffer, "delete_user")

    response = db_client.post(
        f"/api/v1/admin/users/{staffer.id}/deactivate", headers=_auth_headers(staffer)
    )
    assert response.status_code == 400
