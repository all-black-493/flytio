"""Tests for external_services/unsplash.py and crud/destinations.py.

No test here mocks httpx directly - same precedent as
external_services/flight.py and payment.py, neither of which has a test
exercising their raw HTTP internals either; only pure logic
(with_utm, schema parsing) and DB-layer functions are tested directly.
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.destinations import (
    get_distinct_destination_iata_codes,
    upsert_destination_image,
)
from backend.external_services.unsplash import with_utm
from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.destinations import DestinationImage
from backend.models.users import UserInDB
from backend.schemas.unsplash import UnsplashSearchResponse

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def test_with_utm_appends_params_to_bare_url():
    result = with_utm("https://unsplash.com/@janedoe")
    assert "utm_source=flyt" in result
    assert "utm_medium=referral" in result
    assert result.startswith("https://unsplash.com/@janedoe?")


def test_with_utm_merges_without_duplicating_existing_query():
    result = with_utm("https://unsplash.com/@janedoe?ref=other")
    assert "ref=other" in result
    assert result.count("utm_source") == 1


def test_unsplash_search_response_parses_sample_payload():
    payload = {
        "total": 1,
        "total_pages": 1,
        "results": [
            {
                "id": "abc123",
                "urls": {
                    "regular": "https://images.unsplash.com/photo-abc123?w=1080",
                    "small": "https://images.unsplash.com/photo-abc123?w=400",
                },
                "user": {
                    "name": "Jane Doe",
                    "links": {"html": "https://unsplash.com/@janedoe"},
                },
                "links": {
                    "download_location": "https://api.unsplash.com/photos/abc123/download"
                },
            }
        ],
    }

    result = UnsplashSearchResponse.model_validate(payload)

    assert len(result.results) == 1
    photo = result.results[0]
    assert photo.id == "abc123"
    assert photo.urls.regular == "https://images.unsplash.com/photo-abc123?w=1080"
    assert photo.user.name == "Jane Doe"
    assert (
        photo.links.download_location
        == "https://api.unsplash.com/photos/abc123/download"
    )


def test_upsert_destination_image_replaces_existing_row(session):
    upsert_destination_image(
        session,
        iata_code="DXB",
        unsplash_photo_id="old123",
        image_url="https://images.unsplash.com/old",
        thumb_url="https://images.unsplash.com/old-thumb",
        photographer_name="Old Photographer",
        photographer_profile_url="https://unsplash.com/@old",
    )

    upsert_destination_image(
        session,
        iata_code="DXB",
        unsplash_photo_id="new456",
        image_url="https://images.unsplash.com/new",
        thumb_url="https://images.unsplash.com/new-thumb",
        photographer_name="New Photographer",
        photographer_profile_url="https://unsplash.com/@new",
    )

    row = session.get(DestinationImage, "DXB")
    assert row is not None
    assert row.unsplash_photo_id == "new456"
    assert row.photographer_name == "New Photographer"


def test_get_distinct_destination_iata_codes(session):
    user = UserInDB(email="dest-codes@example.com", password="hashed")
    session.add(user)
    session.commit()
    session.refresh(user)

    for i, (origin, destination) in enumerate(
        [("NBO", "DXB"), ("NBO", "DXB"), ("NBO", "LHR")]
    ):
        booking = Booking(
            user_id=user.id,
            duffel_order_id=f"ord_{i}",
            booking_reference=f"REF{i}",
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
                duffel_slice_id=f"sli_{i}",
                origin_iata_code=origin,
                destination_iata_code=destination,
            )
        )
    session.commit()

    codes = get_distinct_destination_iata_codes(session)

    assert set(codes) == {"DXB", "LHR"}
