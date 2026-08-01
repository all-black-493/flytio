"""Wire shape for Unsplash's Search Photos response - only the fields
external_services/unsplash.py and scripts/backfill_destination_images.py
need, not Unsplash's full photo object.
"""

from pydantic import BaseModel


class UnsplashPhotoUrls(BaseModel):
    regular: str
    small: str


class UnsplashPhotoLinks(BaseModel):
    download_location: str


class UnsplashUserLinks(BaseModel):
    html: str


class UnsplashUser(BaseModel):
    name: str
    links: UnsplashUserLinks


class UnsplashPhoto(BaseModel):
    id: str
    urls: UnsplashPhotoUrls
    user: UnsplashUser
    links: UnsplashPhotoLinks


class UnsplashSearchResponse(BaseModel):
    total: int
    results: list[UnsplashPhoto]
