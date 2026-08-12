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


def _itinerary_signature(offer: dict) -> str:
    """Identifies the actual flights an offer puts you on: every segment's
    marketing carrier, flight number and departure time, across every
    slice.

    This is what a search result *is* to a traveller - "KQ310 at 17:10" -
    so offers sharing it are the same journey sold under different fare
    conditions, and belong in one card with the cheapest leading.

    It deliberately replaces a signature of origin/destination per slice.
    That grouped by ROUTE, which on any point-to-point search is identical
    for every offer: a live NBO-DXB search returned 89 offers across 8
    airlines and collapsed them into a single group, of which only the
    primary and 8 alternates survived. Ethiopian, Turkish, EgyptAir,
    flydubai and South African were fetched, grouped away and never shown.
    """
    parts = []
    for s in offer.get("slices") or []:
        for seg in s.get("segments") or []:
            carrier = (seg.get("marketing_carrier") or {}).get("iata_code") or ""
            number = seg.get("marketing_carrier_flight_number") or ""
            departs = seg.get("departing_at") or ""
            parts.append(f"{carrier}{number}@{departs}")
        parts.append("|")
    return ",".join(parts)


# Alternates are the same flights under different fare conditions (Basic,
# Flex, and so on), so a handful is plenty - nobody compares 30 fare
# brands on one flight by hand.
MAX_ALTERNATES_PER_GROUP = 8


def group_by_route(sorted_offers: list[dict]) -> list[OfferGroup]:
    """Groups offers that put you on the exact same flights (see
    _itinerary_signature). A group's position follows the first occurrence
    of its signature in `sorted_offers` (mirroring JS Map insertion order),
    so the caller's chosen sort decides which itinerary leads the list,
    while a group's own primary/alternates split is always cheapest-first,
    capped at MAX_ALTERNATES_PER_GROUP."""
    groups: dict[str, list[dict]] = {}
    for offer in sorted_offers:
        groups.setdefault(_itinerary_signature(offer), []).append(offer)

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
    duffel_response: dict, params: OfferListQueryParams, markup_rate: float
) -> FlightSearchResponse:
    """Full pipeline for one request: facets from the complete cached
    offer list, then filter -> sort -> group -> paginate for the page
    actually sent back. Order matters - see group_by_route()'s docstring
    for why sort must run before grouping. `markup_rate` is the caller's
    job to resolve (utils/pricing.py's get_active_markup_rate) - kept out
    of this function so it stays a pure, DB-free view-layer transform."""
    offer_request = duffel_response["data"]
    # Marked up here, before anything downstream reads a price, so facets,
    # filtering, sorting, and the final Offer.model_validate() all see
    # consistent numbers - a shallow copy per offer keeps the Redis-cached
    # raw Duffel response itself unmarked-up.
    offers = [
        apply_markup_to_offer_dict(dict(o), markup_rate)
        for o in (offer_request.get("offers") or [])
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
