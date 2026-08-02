from urllib.parse import urlencode, urlparse, urlunparse

import httpx

from backend.config import settings
from backend.schemas.unsplash import UnsplashPhoto, UnsplashSearchResponse

UNSPLASH_BASE_URL = "https://api.unsplash.com"

# Unsplash's crediting guideline requires every link back to Unsplash (the
# photographer's profile, and a link to unsplash.com itself) to carry
# these two params - see with_utm() below and UNSPLASH_HOMEPAGE_URL,
# which frontend/src/components/home/popular-destinations.tsx uses
# for the "on Unsplash" half of the "Photo by X on Unsplash" credit.
UNSPLASH_UTM_PARAMS = {"utm_source": "flyt", "utm_medium": "referral"}
UNSPLASH_HOMEPAGE_URL = "https://unsplash.com/?" + urlencode(UNSPLASH_UTM_PARAMS)


def with_utm(url: str) -> str:
    """Appends Unsplash's required utm_source/utm_medium to a profile
    link - `urlencode` on the merged dict (not a raw string append) so
    this is correct even if the URL already carries query params."""
    parts = urlparse(url)
    query = dict(pair.split("=", 1) for pair in parts.query.split("&") if pair)
    query.update(UNSPLASH_UTM_PARAMS)
    return urlunparse(parts._replace(query=urlencode(query)))


class UnsplashAPIError(Exception):
    """Raised when the Unsplash API returns an HTTP error."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class UnsplashService:
    """Service for the Unsplash API's public (Access Key) actions - photo
    search and download-tracking. See https://unsplash.com/documentation

    Two of Unsplash's API guidelines are load-bearing here, not optional
    style choices:
    - Hotlinking: callers of search_destination_photo must use the
      returned urls.* directly, never download and re-host the image.
    - Download tracking: track_download must be called once, at the
      moment a photo is *selected* for use (here: when
      scripts/backfill_destination_images.py picks a search result to
      store) - this is what Unsplash's guidelines call an action "similar
      to a download".
    """

    def __init__(self):
        self.access_key = settings.UNSPLASH_ACCESS_KEY
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        # Created lazily so the app (and tests) can import this module
        # before UNSPLASH_ACCESS_KEY is configured.
        if self._client is None:
            if not self.access_key:
                raise ValueError(
                    "Unsplash access key not configured (set UNSPLASH_ACCESS_KEY)"
                )
            self._client = httpx.AsyncClient(
                base_url=UNSPLASH_BASE_URL,
                headers={"Authorization": f"Client-ID {self.access_key}"},
                timeout=httpx.Timeout(30.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def search_destination_photo(self, query: str) -> UnsplashPhoto | None:
        """The single best-matching landscape photo for a search query
        (e.g. a city name), or None if Unsplash has nothing for it.
        content_filter=high since these render publicly on flyt's
        homepage, unmoderated."""
        response = await self.client.get(
            "/search/photos",
            params={
                "query": query,
                "per_page": 1,
                "orientation": "landscape",
                "content_filter": "high",
            },
        )
        if response.is_error:
            raise UnsplashAPIError(response.status_code, response.text)
        result = UnsplashSearchResponse.model_validate(response.json())
        return result.results[0] if result.results else None

    async def track_download(self, download_location: str) -> None:
        """Required by Unsplash's API guidelines whenever a searched
        photo is selected for use. download_location is already a full
        URL (photo.links.download_location, not a path) - httpx resolves
        an absolute URL as-is, ignoring self.client's base_url."""
        response = await self.client.get(download_location)
        if response.is_error:
            raise UnsplashAPIError(response.status_code, response.text)


unsplash_service = UnsplashService()
