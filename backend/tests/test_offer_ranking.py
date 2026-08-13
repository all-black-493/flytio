"""Tests for the BEST ranking and departure-window filter
(utils/offer_filtering.py).

"Cheapest" is a poor default for a comparison site: on most routes the
lowest fare is a multi-stop itinerary hours longer than the direct one.
BEST trades price against duration and stops so the headline result is
one a traveller would actually pick.
"""

from backend.schemas.duffel_flights import DepartureWindow, OfferSortKey
from backend.utils.offer_filtering import in_departure_window, sort_offers


def _offer(oid: str, price: str, duration: str, stops: int, hour: int) -> dict:
    segments = [{"departing_at": f"2026-09-15T{hour:02d}:00:00"}] + [{}] * stops
    return {
        "id": oid,
        "total_amount": price,
        "slices": [{"duration": duration, "segments": segments}],
    }


def test_best_prefers_a_slightly_pricier_direct_over_a_long_multi_stop():
    cheap_but_grim = _offer("grim", "380.00", "PT20H", 2, 14)
    direct = _offer("direct", "400.00", "PT5H", 0, 8)

    ranked = sort_offers([cheap_but_grim, direct], OfferSortKey.BEST)

    assert ranked[0]["id"] == "direct"
    # ...while sorting by price still puts the cheapest first, so the two
    # rankings stay genuinely different rather than BEST being a rename.
    assert sort_offers([cheap_but_grim, direct], OfferSortKey.PRICE)[0]["id"] == "grim"


def test_best_still_prefers_cheaper_when_everything_else_matches():
    ranked = sort_offers(
        [
            _offer("dear", "900.00", "PT5H", 0, 8),
            _offer("cheap", "400.00", "PT5H", 0, 8),
        ],
        OfferSortKey.BEST,
    )
    assert [o["id"] for o in ranked] == ["cheap", "dear"]


def test_best_handles_a_single_offer_without_dividing_by_zero():
    """Normalisation spans the result set, so a one-offer set has zero
    span on every axis."""
    only = _offer("only", "400.00", "PT5H", 0, 8)
    assert sort_offers([only], OfferSortKey.BEST) == [only]


def test_departure_windows_cover_the_clock_without_overlapping():
    hours = {
        6: DepartureWindow.MORNING,
        13: DepartureWindow.AFTERNOON,
        19: DepartureWindow.EVENING,
        23: DepartureWindow.NIGHT,
        2: DepartureWindow.NIGHT,  # night wraps midnight
    }
    for hour, expected in hours.items():
        offer = _offer(f"h{hour}", "400.00", "PT5H", 0, hour)
        matching = [w for w in DepartureWindow if in_departure_window(offer, w)]
        assert matching == [expected], f"{hour}:00 matched {matching}"
