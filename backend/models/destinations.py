from datetime import datetime

from sqlmodel import Field, SQLModel


class DestinationImage(SQLModel, table=True):
    """One cached Unsplash photo per destination city, keyed by IATA
    code - populated by scripts/backfill_destination_images.py, never
    fetched live in a request path (see that script's docstring). Joined
    into crud/bookings.py's get_popular_routes by destination_iata_code;
    a destination with no row here just renders without a photo.

    image_url/thumb_url are Unsplash's own hotlinked CDN URLs (per
    Unsplash's API guidelines, `photo.urls.*` must be used directly, not
    downloaded and re-hosted). photographer_name/photographer_profile_url
    back the "Photo by X on Unsplash" credit every consumer of this table
    must render alongside the image - also required by Unsplash's
    guidelines, not optional styling.
    """

    iata_code: str = Field(primary_key=True, max_length=3)

    unsplash_photo_id: str = Field(nullable=False)
    image_url: str = Field(
        nullable=False, description="urls.regular - card-sized hotlink"
    )
    thumb_url: str = Field(
        nullable=False, description="urls.small - list/thumbnail hotlink"
    )
    photographer_name: str
    photographer_profile_url: str = Field(
        description="Photographer's Unsplash profile, with utm_source/utm_medium params"
    )

    fetched_at: datetime = Field(default_factory=datetime.utcnow)
