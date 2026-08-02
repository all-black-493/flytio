from typing import Any, TypeVar

from fastapi import Depends
from fastapi_pagination.api import pagination_ctx
from fastapi_pagination.cursor import CursorPage

T = TypeVar("T")


def cursor_page(item_schema: type[T]) -> dict[str, Any]:
    """Route kwargs that make an endpoint cursor-paginated:

        @router.get("/bookings", **cursor_page(BookingPublic))

    which is the same as declaring `response_model=CursorPage[BookingPublic]`
    plus the dependency that supplies the ?cursor=&size= query params. The
    two always have to name the same item schema, so they're built together
    here rather than repeated - and correspondingly - at every call site.

    Why the per-route dependency instead of fastapi-pagination's usual
    one-line `add_pagination(app)`: add_pagination rewrites every matching
    route's body field through fastapi.dependencies.utils.get_body_field,
    whose signature FastAPI changed (it takes flat_dependant/name/
    embed_body_fields now, not the body_params fastapi-pagination passes).
    Calling it raises TypeError at import time on FastAPI 0.139, and
    fastapi-pagination 0.15.16 is the latest release, so there's no version
    to upgrade to - it declares `fastapi>=0.93.0` but reaches into an
    internal that has since moved. pagination_ctx is the library's own
    documented per-route entry point and never touches that code path.
    """
    page = CursorPage[item_schema]
    return {"response_model": page, "dependencies": [Depends(pagination_ctx(page))]}
