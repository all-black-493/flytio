"""Fetches and caches one Unsplash photo per destination city that has
ever appeared in a real booking, so routers/flights.py's
popular-destinations cards (and routers/admin.py's dashboard equivalent)
can show a photo without ever calling Unsplash from a request path.

Run after UNSPLASH_ACCESS_KEY is set in backend/.env, and again any time
a genuinely new destination starts showing up in real bookings (this
only fills gaps - by default it skips any destination that already has a
cached row, so re-running is always safe):

    python -m backend.scripts.backfill_destination_images
    python -m backend.scripts.backfill_destination_images --force  # re-fetch everything

Unsplash's Demo-tier rate limit is 50 requests/hour (Production apps get
5000/hour) - each destination costs 2 requests (search + the mandatory
download-tracking ping below), so this sleeps between destinations and
will simply fail loudly with UnsplashAPIError once the hourly cap is hit;
re-run later to pick up where it left off, since already-cached
destinations are skipped.
"""

import argparse
import asyncio

from sqlmodel import Session, select

from backend.crud.db import engine
from backend.crud.destinations import (
    get_distinct_destination_iata_codes,
    upsert_destination_image,
)
from backend.external_services.unsplash import (
    UnsplashAPIError,
    unsplash_service,
    with_utm,
)
from backend.models.bookings import BookingSlice
from backend.models.destinations import DestinationImage

# Polite pacing under Unsplash's Demo-tier 50 req/hour cap (2 requests
# per destination) - not a hard requirement, just avoids bursting
# straight into a 429 on a longer destination list.
DELAY_BETWEEN_DESTINATIONS_SECONDS = 2.0


def _city_name_for(session: Session, iata_code: str) -> str:
    """A real BookingSlice's destination_city_name for this code, falling
    back to the IATA code itself (still a valid, if narrower, Unsplash
    search query) if every slice for it happened to have a null city
    name."""
    row = session.exec(
        select(BookingSlice.destination_city_name)
        .where(
            BookingSlice.destination_iata_code == iata_code,
            BookingSlice.destination_city_name.is_not(None),
        )
        .limit(1)
    ).first()
    return row or iata_code


async def main(*, force: bool) -> None:
    with Session(engine) as session:
        codes = get_distinct_destination_iata_codes(session)
        if not force:
            cached = {
                row.iata_code for row in session.exec(select(DestinationImage)).all()
            }
            codes = [c for c in codes if c not in cached]

        if not codes:
            print("Nothing to do - every destination already has a cached photo.")
            return

        print(f"Fetching photos for {len(codes)} destination(s)...")
        for i, iata_code in enumerate(codes):
            city_name = _city_name_for(session, iata_code)
            try:
                photo = await unsplash_service.search_destination_photo(
                    f"{city_name} city skyline"
                )
                if photo is None:
                    print(f"  {iata_code} ({city_name}): no Unsplash results, skipped")
                    continue

                await unsplash_service.track_download(photo.links.download_location)

                upsert_destination_image(
                    session,
                    iata_code=iata_code,
                    unsplash_photo_id=photo.id,
                    image_url=photo.urls.regular,
                    thumb_url=photo.urls.small,
                    photographer_name=photo.user.name,
                    photographer_profile_url=with_utm(photo.user.links.html),
                )
                print(f"  {iata_code} ({city_name}): cached photo {photo.id}")
            except UnsplashAPIError as e:
                print(f"  {iata_code} ({city_name}): Unsplash error - {e}")

            if i < len(codes) - 1:
                await asyncio.sleep(DELAY_BETWEEN_DESTINATIONS_SECONDS)

    await unsplash_service.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-fetch every destination, including ones already cached",
    )
    args = parser.parse_args()
    asyncio.run(main(force=args.force))
