"""Tests for how search offers are grouped into result cards
(utils/offer_filtering.py's group_by_route).

A card is one *itinerary* - a specific set of flights - with the fare
options for those same flights collapsed underneath it. Getting this
wrong is invisible in a unit sense but devastating in the product: the
previous signature grouped by route (origin/destination per slice),
which on a point-to-point search is identical for every offer, so an
entire search collapsed into a single card and everything past the
alternates cap was silently dropped.
"""

from backend.utils.offer_filtering import MAX_ALTERNATES_PER_GROUP, group_by_route


def _offer(amount: str, *, carrier: str, number: str, departs: str) -> dict:
    """One-slice, one-segment offer - the shape a simple point-to-point
    search returns."""
    return {
        "id": f"off_{carrier}{number}_{amount}",
        "total_amount": amount,
        "total_currency": "USD",
        "slices": [
            {
                "id": "sli_1",
                "origin": {"iata_code": "NBO", "name": None, "city_name": None},
                "destination": {"iata_code": "DXB", "name": None, "city_name": None},
                "duration": "PT5H",
                "segments": [
                    {
                        "id": f"seg_{carrier}{number}",
                        "origin": {"iata_code": "NBO", "name": None, "city_name": None},
                        "destination": {
                            "iata_code": "DXB",
                            "name": None,
                            "city_name": None,
                        },
                        "origin_terminal": None,
                        "destination_terminal": None,
                        "departing_at": departs,
                        "arriving_at": "2026-09-15T23:00:00",
                        "duration": "PT5H",
                        "marketing_carrier": {
                            "iata_code": carrier,
                            "name": carrier,
                            "logo_symbol_url": None,
                        },
                        "marketing_carrier_flight_number": number,
                        "operating_carrier": None,
                        "operating_carrier_flight_number": None,
                        "aircraft": None,
                    }
                ],
            }
        ],
        "passengers": [],
        "live_mode": False,
        "expires_at": None,
        "base_amount": None,
        "base_currency": None,
        "tax_amount": None,
        "tax_currency": None,
        "owner": {"iata_code": carrier, "name": carrier, "logo_symbol_url": None},
    }


def test_different_flights_get_their_own_card():
    """The regression that mattered: a live NBO-DXB search returned 89
    offers across 8 airlines and rendered ONE card, because every offer
    shares a route signature on a point-to-point search."""
    offers = [
        _offer("400.00", carrier="KQ", number="310", departs="2026-09-15T17:10:00"),
        _offer("410.00", carrier="ET", number="318", departs="2026-09-15T09:00:00"),
        _offer("420.00", carrier="TK", number="601", departs="2026-09-15T21:45:00"),
    ]

    groups = group_by_route(offers)

    assert len(groups) == 3
    assert {g.primary.owner.iata_code for g in groups} == {"KQ", "ET", "TK"}


def test_same_flight_different_fares_collapse_into_one_card():
    """The flip side - fare brands on the SAME flight are one journey and
    belong under one card, cheapest leading, so the list isn't padded
    with the identical departure five times."""
    offers = [
        _offer("500.00", carrier="KQ", number="310", departs="2026-09-15T17:10:00"),
        _offer("400.00", carrier="KQ", number="310", departs="2026-09-15T17:10:00"),
        _offer("450.00", carrier="KQ", number="310", departs="2026-09-15T17:10:00"),
    ]

    groups = group_by_route(offers)

    assert len(groups) == 1
    assert groups[0].primary.total_amount == "400.00"
    assert [a.total_amount for a in groups[0].alternates] == ["450.00", "500.00"]


def test_same_flight_number_at_a_different_time_is_a_different_card():
    """Airlines reuse a flight number across the day; a morning and an
    evening KQ310 are different journeys to a traveller."""
    offers = [
        _offer("400.00", carrier="KQ", number="310", departs="2026-09-15T08:00:00"),
        _offer("400.00", carrier="KQ", number="310", departs="2026-09-15T20:00:00"),
    ]

    assert len(group_by_route(offers)) == 2


def test_alternates_stay_capped():
    """Fare brands are capped so one popular flight can't dominate the
    payload pagination exists to bound."""
    offers = [
        _offer(
            f"{400 + i}.00", carrier="KQ", number="310", departs="2026-09-15T17:10:00"
        )
        for i in range(MAX_ALTERNATES_PER_GROUP + 5)
    ]

    groups = group_by_route(offers)

    assert len(groups) == 1
    assert len(groups[0].alternates) == MAX_ALTERNATES_PER_GROUP
