"""Tests for the public, no-auth popular-destinations endpoint
(routers/flights.py) - same api_client + db_client dependency-override
pattern as tests/test_admin_dashboard.py.
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.db import get_session
from backend.main import app
from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.destinations import DestinationImage
from backend.models.users import UserInDB

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


def _make_route_bookings(
    session: Session, origin: str, destination: str, count: int
) -> None:
    user = UserInDB(
        email=f"traveler-{origin}{destination}@example.com", password="hashed"
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    for i in range(count):
        booking = Booking(
            user_id=user.id,
            duffel_order_id=f"ord_{origin}{destination}{i}",
            booking_reference=f"{origin}{destination}{i}",
            status=BookingStatus.CONFIRMED,
            total_amount="100.00",
            total_currency="USD",
        )
        session.add(booking)
        session.commit()
        session.refresh(booking)
        session.add(
            BookingSlice(
                booking_id=booking.id,
                duffel_slice_id=f"sli_{origin}{destination}{i}",
                origin_iata_code=origin,
                origin_city_name=f"{origin} City",
                destination_iata_code=destination,
                destination_city_name=f"{destination} City",
            )
        )
    session.commit()


def test_requires_no_authentication(db_client):
    response = db_client.get("/flights/popular-destinations")
    assert response.status_code == 200


def test_empty_when_no_route_clears_the_threshold(session, db_client):
    _make_route_bookings(session, "NBO", "DXB", count=2)  # below the threshold of 5

    response = db_client.get("/flights/popular-destinations")
    assert response.status_code == 200
    assert response.json() == []


def test_returns_routes_clearing_the_threshold(session, db_client):
    _make_route_bookings(session, "NBO", "DXB", count=5)
    _make_route_bookings(session, "NBO", "LHR", count=2)  # stays hidden

    response = db_client.get("/flights/popular-destinations")
    assert response.status_code == 200
    routes = response.json()
    assert len(routes) == 1
    assert routes[0]["destination_iata_code"] == "DXB"
    assert routes[0]["booking_count"] == 5


def test_route_has_no_image_fields_when_nothing_cached(session, db_client):
    _make_route_bookings(session, "NBO", "DXB", count=5)

    response = db_client.get("/flights/popular-destinations")
    route = response.json()[0]

    assert route["destination_image_url"] is None
    assert route["destination_image_attribution_name"] is None
    assert route["destination_image_attribution_url"] is None


def test_route_includes_cached_destination_image(session, db_client):
    _make_route_bookings(session, "NBO", "DXB", count=5)
    session.add(
        DestinationImage(
            iata_code="DXB",
            unsplash_photo_id="abc123",
            image_url="https://images.unsplash.com/photo-abc123?w=1080",
            thumb_url="https://images.unsplash.com/photo-abc123?w=400",
            photographer_name="Jane Doe",
            photographer_profile_url="https://unsplash.com/@janedoe?utm_source=flyt&utm_medium=referral",
        )
    )
    session.commit()

    response = db_client.get("/flights/popular-destinations")
    route = response.json()[0]

    assert (
        route["destination_image_url"]
        == "https://images.unsplash.com/photo-abc123?w=1080"
    )
    assert route["destination_image_attribution_name"] == "Jane Doe"
    assert (
        route["destination_image_attribution_url"]
        == "https://unsplash.com/@janedoe?utm_source=flyt&utm_medium=referral"
    )
