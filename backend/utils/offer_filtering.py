"""Filter/sort/group/paginate/facet a Duffel offer list, applied *after* the
Redis-cached (or freshly fetched) search response is read - a view-layer
concern kept separate from the search cache key.

Operates on raw decoded offer dicts (the same shape Offer/OfferSlice/
OfferSegment/Carrier in duffel_flights.py describe), mirroring
frontend/src/app/(app)/search/_lib/filters.ts field-for-field and
behavior-for-behavior, just relocated server-side. See that file's
docstring for why: client-side filtering can no longer see the full result
set once pagination limits what's transmitted, so filtering, sorting,
faceting and route-grouping all have to happen before the page is sliced.
"""

import re

from backend.schemas.common import PaginationMeta
from backend.schemas.duffel_flights import (
    AirlineFacet,
    FlightSearchResponse,
    Offer,
    OfferFacets,
    OfferGroup,
    OfferListQueryParams,
    OfferRequest,
    OfferSortKey,
)
from backend.utils.pricing import apply_markup_to_offer_dict

_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?$")


def offer_stops(offer: dict) -> int:
    slices = offer.get("slices") or []
    if not slices:
        return 0
    return max((len(s.get("segments") or []) - 1 for s in slices), default=0)


def _slice_duration_minutes(duration: str | None) -> int:
    if not duration:
        return 0
    match = _DURATION_RE.match(duration)
    if not match:
        return 0
    hours, minutes = match.groups()
    return int(hours or 0) * 60 + int(minutes or 0)


def offer_duration_minutes(offer: dict) -> int:
    return sum(
        _slice_duration_minutes(s.get("duration")) for s in offer.get("slices") or []
    )


def _owner_code_name(offer: dict) -> tuple[str, str]:
    owner = offer.get("owner") or {}
    code = owner.get("iata_code") or "??"
    name = owner.get("name") or code
    return code, name


def compute_facets(offers: list[dict]) -> OfferFacets:
    """Always run against the full, unfiltered offer list for the search -
    facet counts must stay stable regardless of which filters/page were
    requested."""
    airline_counts: dict[str, dict] = {}
    price_min = float("inf")
    price_max = 0.0
    has_direct = has_one_stop = has_multi_stop = False

    for offer in offers:
        code, name = _owner_code_name(offer)
        entry = airline_counts.setdefault(code, {"name": name, "count": 0})
        entry["count"] += 1

        price = float(offer["total_amount"])
        price_min = min(price_min, price)
        price_max = max(price_max, price)

        stops = offer_stops(offer)
        if stops == 0:
            has_direct = True
        elif stops == 1:
            has_one_stop = True
        else:
            has_multi_stop = True

    airlines = sorted(
        (
            AirlineFacet(code=code, name=v["name"], count=v["count"])
            for code, v in airline_counts.items()
        ),
        key=lambda a: a.count,
        reverse=True,
    )
    return OfferFacets(
        airlines=airlines,
        price_min=price_min if price_min != float("inf") else 0,
        price_max=price_max,
        has_direct=has_direct,
        has_one_stop=has_one_stop,
        has_multi_stop=has_multi_stop,
    )


def apply_filters(offers: list[dict], params: OfferListQueryParams) -> list[dict]:
    def matches(offer: dict) -> bool:
        if params.airlines:
            code, _ = _owner_code_name(offer)
            if code not in params.airlines:
                return False
        if params.max_stops is not None and offer_stops(offer) > params.max_stops:
            return False
        if (
            params.price_max is not None
            and float(offer["total_amount"]) > params.price_max
        ):
            return False
        return True

    return [o for o in offers if matches(o)]


def _first_slice_segments(offer: dict) -> list[dict]:
    slices = offer.get("slices") or []
    return (slices[0].get("segments") or []) if slices else []


def sort_offers(offers: list[dict], sort: OfferSortKey) -> list[dict]:
    if sort == OfferSortKey.PRICE:
        return sorted(offers, key=lambda o: float(o["total_amount"]))
    if sort == OfferSortKey.DURATION:
        return sorted(offers, key=offer_duration_minutes)
    if sort == OfferSortKey.DEPARTURE:
        # Only the outbound (first) slice's first segment, matching
        # sortOffers() in filters.ts exactly.
        return sorted(
            offers,
            key=lambda o: (
                (_first_slice_segments(o) or [{}])[0].get("departing_at") or ""
            ),
        )
    if sort == OfferSortKey.ARRIVAL:
        return sorted(
            offers,
            key=lambda o: (
                (_first_slice_segments(o) or [{}])[-1].get("arriving_at") or ""
            ),
        )
    return offers


def _route_signature(offer: dict) -> str:
    parts = []
    for s in offer.get("slices") or []:
        origin = (s.get("origin") or {}).get("iata_code") or ""
        destination = (s.get("destination") or {}).get("iata_code") or ""
        parts.append(f"{origin}-{destination}")
    return "|".join(parts)


# A route signature is just origin/destination per slice (see
# _route_signature), so a single popular route can collapse hundreds of
# offers into one group - without a cap, that one group's `alternates`
# would carry the entire payload pagination is meant to avoid sending.
# Real fare-comparison UIs (Google Flights, Skyscanner) only ever show a
# handful of alternates anyway; nobody compares 300 fares by hand.
MAX_ALTERNATES_PER_GROUP = 8


def group_by_route(sorted_offers: list[dict]) -> list[OfferGroup]:
    """Groups offers sharing an origin/destination signature. A group's
    position in the result follows the first occurrence of its signature in
    `sorted_offers` (mirrors JS Map insertion-order iteration exactly) - so
    which route "leads" the list follows the caller's chosen sort, while a
    group's own primary/alternates split is always cheapest-first, capped
    at MAX_ALTERNATES_PER_GROUP."""
    groups: dict[str, list[dict]] = {}
    for offer in sorted_offers:
        groups.setdefault(_route_signature(offer), []).append(offer)

    result = []
    for members in groups.values():
        ordered_by_price = sorted(members, key=lambda o: float(o["total_amount"]))
        primary, *alternates = ordered_by_price
        result.append(
            OfferGroup(
                primary=Offer.model_validate(primary),
                alternates=[
                    Offer.model_validate(a)
                    for a in alternates[:MAX_ALTERNATES_PER_GROUP]
                ],
            )
        )
    return result


def paginate_groups(
    groups: list[OfferGroup], limit: int, offset: int
) -> tuple[list[OfferGroup], PaginationMeta]:
    total = len(groups)
    page = groups[offset : offset + limit]
    return page, PaginationMeta(
        limit=limit, offset=offset, total=total, has_more=offset + limit < total
    )


def build_flight_search_response(
    duffel_response: dict, params: OfferListQueryParams
) -> FlightSearchResponse:
    """Full pipeline for one request: facets from the complete cached
    offer list, then filter -> sort -> group -> paginate for the page
    actually sent back. Order matters - see group_by_route()'s docstring
    for why sort must run before grouping."""
    offer_request = duffel_response["data"]
    # Marked up here, before anything downstream reads a price, so facets,
    # filtering, sorting, and the final Offer.model_validate() all see
    # consistent numbers - a shallow copy per offer keeps the Redis-cached
    # raw Duffel response itself unmarked-up.
    offers = [
        apply_markup_to_offer_dict(dict(o)) for o in (offer_request.get("offers") or [])
    ]

    facets = compute_facets(offers)
    filtered = apply_filters(offers, params)
    sorted_offers = sort_offers(filtered, params.sort)
    groups = group_by_route(sorted_offers)
    page, meta = paginate_groups(groups, params.limit, params.offset)

    return FlightSearchResponse(
        data=OfferRequest.model_validate(offer_request),
        groups=page,
        meta=meta,
        facets=facets,
    )
