"""Router-level tests for the staff/admin surface (routers/admin.py),
using the shared api_client fixture (conftest.py) with an in-memory
SQLite DB - same pattern as test_order_changes.py.
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.main import app
from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.flights import Flight
from backend.models.rbac import Group, GroupPermission, Permission, UserGroup
from backend.models.users import UserInDB
from backend.routers import admin as admin_router
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
    response = db_client.get("/api/v1/admin/bookings")
    assert response.status_code == 401


def test_admin_bookings_rejects_non_staff(session, db_client):
    user = _make_user(session)

    response = db_client.get("/api/v1/admin/bookings", headers=_auth_headers(user))
    assert response.status_code == 403


def test_admin_bookings_rejects_staff_without_permission(session, db_client):
    user = _make_user(session, is_staff=True)

    response = db_client.get("/api/v1/admin/bookings", headers=_auth_headers(user))
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

    response = db_client.get("/api/v1/admin/bookings", headers=_auth_headers(staffer))

    assert response.status_code == 200
    references = [b["booking_reference"] for b in response.json()["items"]]
    assert "ABC123" in references


def test_admin_bookings_allows_superuser_without_any_grant(session, db_client):
    _make_booking(session, _make_user(session), "XYZ789")
    superuser = _make_user(
        session, email="root@example.com", is_staff=True, is_superuser=True
    )

    response = db_client.get("/api/v1/admin/bookings", headers=_auth_headers(superuser))
    assert response.status_code == 200


def test_group_management_rejects_non_superuser_staff(session, db_client):
    staffer = _make_user(session, is_staff=True)

    response = db_client.post(
        "/api/v1/admin/groups", json={"name": "ops"}, headers=_auth_headers(staffer)
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
        "/api/v1/admin/groups", json={"name": "support"}, headers=headers
    )
    assert create_response.status_code == 200
    group_id = create_response.json()["id"]

    assign_perm_response = db_client.post(
        f"/api/v1/admin/groups/{group_id}/permissions",
        json={"codenames": ["view_booking"]},
        headers=headers,
    )
    assert assign_perm_response.status_code == 200
    assert assign_perm_response.json()["permissions"] == ["view_booking"]

    assign_user_response = db_client.post(
        f"/api/v1/admin/users/{target.id}/groups",
        json={"group_ids": [group_id]},
        headers=headers,
    )
    assert assign_user_response.status_code == 200

    # The freshly-assigned group's permission now works for `target`.
    target_response = db_client.get(
        "/api/v1/admin/bookings", headers=_auth_headers(target)
    )
    assert target_response.status_code == 200

    remove_response = db_client.delete(
        f"/api/v1/admin/users/{target.id}/groups/{group_id}", headers=headers
    )
    assert remove_response.status_code == 200

    # The permission no longer applies once removed from the group.
    after_remove = db_client.get(
        "/api/v1/admin/bookings", headers=_auth_headers(target)
    )
    assert after_remove.status_code == 403


def test_get_booking_detail_returns_owner_and_404s_for_missing(session, db_client):
    owner = _make_user(session, email="traveler@example.com")
    booking = _make_booking(session, owner, "ABC123")
    superuser = _make_user(
        session, email="root3@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)

    ok_response = db_client.get(f"/api/v1/admin/bookings/{booking.id}", headers=headers)
    assert ok_response.status_code == 200
    body = ok_response.json()
    assert body["booking_reference"] == "ABC123"
    assert body["user_email"] == "traveler@example.com"

    missing_response = db_client.get(
        "/api/v1/admin/bookings/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert missing_response.status_code == 404


def test_get_user_detail_includes_group_ids(session, db_client):
    target = _make_user(session, email="agent@example.com", is_staff=True)
    group = Group(name="support")
    session.add(group)
    session.commit()
    session.refresh(group)
    session.add(UserGroup(user_id=target.id, group_id=group.id))
    session.commit()

    superuser = _make_user(
        session, email="root4@example.com", is_staff=True, is_superuser=True
    )

    response = db_client.get(
        f"/api/v1/admin/users/{target.id}", headers=_auth_headers(superuser)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "agent@example.com"
    assert body["group_ids"] == [group.id]


def test_ban_requires_delete_user_permission(session, db_client):
    target = _make_user(session, email="target@example.com")
    staffer = _make_user(session, email="staffer2@example.com", is_staff=True)

    response = db_client.post(
        f"/api/v1/admin/users/{target.id}/ban",
        json={"reason": "spam"},
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 403


def test_ban_blocks_self_ban(session, db_client):
    superuser = _make_user(
        session, email="root5@example.com", is_staff=True, is_superuser=True
    )

    response = db_client.post(
        f"/api/v1/admin/users/{superuser.id}/ban",
        json={"reason": "oops"},
        headers=_auth_headers(superuser),
    )
    assert response.status_code == 400


def test_ban_then_unban_end_to_end(session, db_client):
    target = _make_user(session, email="target2@example.com")
    superuser = _make_user(
        session, email="root6@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)

    ban_response = db_client.post(
        f"/api/v1/admin/users/{target.id}/ban",
        json={"reason": "abusive support calls"},
        headers=headers,
    )
    assert ban_response.status_code == 200
    assert ban_response.json()["banned_reason"] == "abusive support calls"

    detail_response = db_client.get(f"/api/v1/admin/users/{target.id}", headers=headers)
    assert detail_response.json()["banned_by_email"] == "root6@example.com"

    unban_response = db_client.post(
        f"/api/v1/admin/users/{target.id}/unban", headers=headers
    )
    assert unban_response.status_code == 200
    assert unban_response.json()["banned_at"] is None


def _admin_booking_request(user_id) -> dict:
    return {
        "user_id": str(user_id),
        "selected_offers": ["off_test123"],
        "passengers": [
            {
                "id": "pas_test123",
                "title": "mr",
                "gender": "m",
                "given_name": "Test",
                "family_name": "Passenger",
                "born_on": "1990-01-01",
                "email": "test@example.com",
                "phone_number": "+254757573984",
            }
        ],
    }


def _fake_priced_offer() -> dict:
    return {
        "data": {
            "total_amount": "93.46",
            "total_currency": "USD",
            "passenger_identity_documents_required": False,
            "available_services": [],
        }
    }


def _fake_admin_order() -> dict:
    return {
        "data": {
            "id": "ord_test123",
            "booking_reference": "ADM123",
            "total_amount": "93.46",
            "total_currency": "USD",
            "slices": [
                {
                    "id": "sli_test123",
                    "origin": {"iata_code": "JFK"},
                    "destination": {"iata_code": "LHR"},
                    "segments": [
                        {
                            "id": "seg_test123",
                            "origin": {"iata_code": "JFK"},
                            "destination": {"iata_code": "LHR"},
                            "departing_at": "2026-01-01T10:00:00",
                            "arriving_at": "2026-01-01T22:00:00",
                            "passengers": [],
                        }
                    ],
                }
            ],
            "passengers": [
                {
                    "id": "pas_test123",
                    "given_name": "Test",
                    "family_name": "Passenger",
                    "born_on": "1990-01-01",
                    "email": "test@example.com",
                    "phone_number": "+254757573984",
                }
            ],
            "documents": [],
        }
    }


def test_create_admin_booking_rejects_staff_without_permission(session, db_client):
    target = _make_user(session, email="customer@example.com")
    staffer = _make_user(session, email="staffer3@example.com", is_staff=True)

    response = db_client.post(
        "/api/v1/admin/bookings",
        json=_admin_booking_request(target.id),
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 403


def test_create_admin_booking_404s_for_unknown_user(session, db_client):
    """The user lookup happens before any Duffel call, so this needs no
    mocking - confirm_price is never reached."""
    superuser = _make_user(
        session, email="root7@example.com", is_staff=True, is_superuser=True
    )

    response = db_client.post(
        "/api/v1/admin/bookings",
        json=_admin_booking_request("00000000-0000-0000-0000-000000000000"),
        headers=_auth_headers(superuser),
    )
    assert response.status_code == 404


def test_create_admin_booking_end_to_end(session, db_client, monkeypatch):
    customer = _make_user(session, email="customer2@example.com")
    superuser = _make_user(
        session, email="root8@example.com", is_staff=True, is_superuser=True
    )

    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    async def fake_create_flight_order(order):
        return _fake_admin_order()

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    response = db_client.post(
        "/api/v1/admin/bookings",
        json=_admin_booking_request(customer.id),
        headers=_auth_headers(superuser),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["booking_reference"] == "ADM123"
    assert body["user_id"] == str(customer.id)
    assert body["user_email"] == "customer2@example.com"
    assert body["status"] == "confirmed"


def test_create_admin_booking_returns_502_when_duffel_fails(
    session, db_client, monkeypatch
):
    customer = _make_user(session, email="customer3@example.com")
    superuser = _make_user(
        session, email="root9@example.com", is_staff=True, is_superuser=True
    )

    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    async def fake_create_flight_order(order):
        raise DuffelAPIError(422, [{"message": "offer expired"}])

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    response = db_client.post(
        "/api/v1/admin/bookings",
        json=_admin_booking_request(customer.id),
        headers=_auth_headers(superuser),
    )

    assert response.status_code == 502


def test_pricing_sales_rejects_staff_without_permission(session, db_client):
    staffer = _make_user(session, email="staffer4@example.com", is_staff=True)

    response = db_client.post(
        "/api/v1/admin/pricing/sales",
        json={
            "name": "Black Friday",
            "markup_rate": 0.03,
            "starts_at": "2026-11-27T00:00:00",
            "ends_at": "2026-11-30T00:00:00",
        },
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 403


def test_create_and_list_pricing_sale_end_to_end(session, db_client):
    superuser = _make_user(
        session, email="root10@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)

    create_response = db_client.post(
        "/api/v1/admin/pricing/sales",
        json={
            "name": "Black Friday",
            "markup_rate": 0.03,
            "starts_at": "2026-11-27T00:00:00",
            "ends_at": "2026-11-30T00:00:00",
        },
        headers=headers,
    )
    assert create_response.status_code == 200
    body = create_response.json()
    assert body["name"] == "Black Friday"
    assert body["markup_rate"] == 0.03

    list_response = db_client.get("/api/v1/admin/pricing/sales", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_create_pricing_sale_rejects_overlap_via_api(session, db_client):
    superuser = _make_user(
        session, email="root11@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)
    db_client.post(
        "/api/v1/admin/pricing/sales",
        json={
            "name": "First",
            "markup_rate": 0.03,
            "starts_at": "2026-11-27T00:00:00",
            "ends_at": "2026-11-30T00:00:00",
        },
        headers=headers,
    )

    response = db_client.post(
        "/api/v1/admin/pricing/sales",
        json={
            "name": "Overlapping",
            "markup_rate": 0.05,
            "starts_at": "2026-11-29T00:00:00",
            "ends_at": "2026-12-02T00:00:00",
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_delete_pricing_sale_end_to_end(session, db_client):
    superuser = _make_user(
        session, email="root12@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)
    created = db_client.post(
        "/api/v1/admin/pricing/sales",
        json={
            "name": "Temp sale",
            "markup_rate": 0.03,
            "starts_at": "2026-11-27T00:00:00",
            "ends_at": "2026-11-30T00:00:00",
        },
        headers=headers,
    ).json()

    delete_response = db_client.delete(
        f"/api/v1/admin/pricing/sales/{created['id']}", headers=headers
    )
    assert delete_response.status_code == 200

    list_response = db_client.get("/api/v1/admin/pricing/sales", headers=headers)
    assert list_response.json() == []


def test_create_and_list_discount_code_end_to_end(session, db_client):
    superuser = _make_user(
        session, email="root13@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)

    create_response = db_client.post(
        "/api/v1/admin/pricing/discount-codes",
        json={"code": "flyt10", "discount_percentage": 10, "max_redemptions": 50},
        headers=headers,
    )
    assert create_response.status_code == 200
    body = create_response.json()
    assert body["code"] == "FLYT10"
    assert body["times_redeemed"] == 0

    list_response = db_client.get(
        "/api/v1/admin/pricing/discount-codes", headers=headers
    )
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_create_discount_code_rejects_duplicate_via_api(session, db_client):
    superuser = _make_user(
        session, email="root14@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)
    db_client.post(
        "/api/v1/admin/pricing/discount-codes",
        json={"code": "DUPE", "discount_percentage": 10},
        headers=headers,
    )

    response = db_client.post(
        "/api/v1/admin/pricing/discount-codes",
        json={"code": "dupe", "discount_percentage": 20},
        headers=headers,
    )
    assert response.status_code == 400


def test_set_discount_code_active_end_to_end(session, db_client):
    superuser = _make_user(
        session, email="root15@example.com", is_staff=True, is_superuser=True
    )
    headers = _auth_headers(superuser)
    created = db_client.post(
        "/api/v1/admin/pricing/discount-codes",
        json={"code": "TOGGLE", "discount_percentage": 10},
        headers=headers,
    ).json()

    response = db_client.post(
        f"/api/v1/admin/pricing/discount-codes/{created['id']}/active",
        json={"is_active": False},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


# ---------- admin ticket actions: backfill + resend confirmation ----------


def _fake_order_with_documents(booking: Booking) -> dict:
    return {
        "data": {
            "id": booking.duffel_order_id,
            "booking_reference": booking.booking_reference,
            "total_amount": booking.total_amount,
            "total_currency": booking.total_currency,
            "documents": [
                {
                    "unique_identifier": "TKT-0001",
                    "type": "electronic_ticket",
                    "passenger_ids": [],
                }
            ],
        }
    }


def test_backfill_tickets_rejects_staff_without_permission(session, db_client):
    owner = _make_user(session, email="ticketowner1@example.com")
    booking = _make_booking(session, owner, "TIX001")
    staffer = _make_user(session, email="ticketstaff1@example.com", is_staff=True)

    response = db_client.post(
        f"/api/v1/admin/bookings/{booking.id}/backfill-tickets",
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 403


def test_backfill_tickets_fetches_and_persists_from_duffel(
    session, db_client, monkeypatch
):
    owner = _make_user(session, email="ticketowner2@example.com")
    booking = _make_booking(session, owner, "TIX002")
    superuser = _make_user(
        session, email="root16@example.com", is_staff=True, is_superuser=True
    )

    async def fake_get_flight_order(order_id):
        assert order_id == booking.duffel_order_id
        return _fake_order_with_documents(booking)

    monkeypatch.setattr(
        duffel_flight_service, "get_flight_order", fake_get_flight_order
    )

    response = db_client.post(
        f"/api/v1/admin/bookings/{booking.id}/backfill-tickets",
        headers=_auth_headers(superuser),
    )

    assert response.status_code == 200


def test_backfill_tickets_is_a_noop_when_booking_already_has_tickets(
    session, db_client, monkeypatch
):
    owner = _make_user(session, email="ticketowner3@example.com")
    booking = _make_booking(session, owner, "TIX003")
    superuser = _make_user(
        session, email="root17@example.com", is_staff=True, is_superuser=True
    )

    calls = []

    async def fake_get_flight_order(order_id):
        calls.append(order_id)
        return _fake_order_with_documents(booking)

    monkeypatch.setattr(
        duffel_flight_service, "get_flight_order", fake_get_flight_order
    )

    headers = _auth_headers(superuser)
    first = db_client.post(
        f"/api/v1/admin/bookings/{booking.id}/backfill-tickets", headers=headers
    )
    second = db_client.post(
        f"/api/v1/admin/bookings/{booking.id}/backfill-tickets", headers=headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    # Only the first call actually hit Duffel - the second found existing
    # tickets and returned early (see crud/tickets.py's
    # backfill_tickets_from_duffel), so no duplicate-insert IntegrityError.
    assert len(calls) == 1


def test_resend_confirmation_rejects_staff_without_permission(session, db_client):
    owner = _make_user(session, email="ticketowner4@example.com")
    booking = _make_booking(session, owner, "TIX004")
    staffer = _make_user(session, email="ticketstaff2@example.com", is_staff=True)

    response = db_client.post(
        f"/api/v1/admin/bookings/{booking.id}/resend-confirmation",
        headers=_auth_headers(staffer),
    )
    assert response.status_code == 403


def test_resend_confirmation_end_to_end(session, db_client, monkeypatch):
    from datetime import datetime as dt

    owner = _make_user(session, email="ticketowner5@example.com")
    booking = _make_booking(session, owner, "TIX005")
    # booking_confirmation_email_html needs a real slice/flight to render
    # its route summary/departure date - _make_booking alone (shared by
    # every other test in this file) deliberately doesn't include one.
    slice_ = BookingSlice(
        booking_id=booking.id,
        duffel_slice_id="sli_test",
        origin_iata_code="JFK",
        destination_iata_code="LHR",
    )
    session.add(slice_)
    session.commit()
    session.refresh(slice_)
    session.add(
        Flight(
            slice_id=slice_.id,
            duffel_segment_id="seg_test",
            origin_iata_code="JFK",
            destination_iata_code="LHR",
            departing_at=dt(2026, 1, 1, 10, 0),
            arriving_at=dt(2026, 1, 1, 22, 0),
        )
    )
    session.commit()
    session.refresh(booking)

    superuser = _make_user(
        session, email="root18@example.com", is_staff=True, is_superuser=True
    )

    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append((subject, recipients))

    monkeypatch.setattr(
        admin_router, "send_html_email_async", fake_send_html_email_async
    )

    response = db_client.post(
        f"/api/v1/admin/bookings/{booking.id}/resend-confirmation",
        headers=_auth_headers(superuser),
    )

    assert response.status_code == 200
    assert len(sent) == 1
    assert sent[0][1] == [owner.email]
