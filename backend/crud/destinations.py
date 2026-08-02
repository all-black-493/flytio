from sqlmodel import Session, select

from backend.models.bookings import BookingSlice
from backend.models.destinations import DestinationImage


def upsert_destination_image(
    session: Session,
    *,
    iata_code: str,
    unsplash_photo_id: str,
    image_url: str,
    thumb_url: str,
    photographer_name: str,
    photographer_profile_url: str,
) -> DestinationImage:
    """Insert or replace the cached photo for one destination - called
    only by scripts/backfill_destination_images.py, never from a request
    path."""
    existing = session.get(DestinationImage, iata_code)
    if existing is not None:
        session.delete(existing)
        session.commit()

    row = DestinationImage(
        iata_code=iata_code,
        unsplash_photo_id=unsplash_photo_id,
        image_url=image_url,
        thumb_url=thumb_url,
        photographer_name=photographer_name,
        photographer_profile_url=photographer_profile_url,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def get_distinct_destination_iata_codes(session: Session) -> list[str]:
    """Every destination_iata_code that has ever appeared in a
    BookingSlice - the candidate set scripts/backfill_destination_images.py
    fetches a photo for."""
    return list(
        session.exec(select(BookingSlice.destination_iata_code).distinct()).all()
    )
