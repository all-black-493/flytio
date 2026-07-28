"""Unit tests for the fare markup in utils/pricing.py - the entire
revenue mechanism (see routers/payments.py's checkout and
crud/payments.py's finalize_payment for how raw vs marked-up amounts
are kept separate end-to-end)."""

from backend.utils.pricing import (
    MARKUP_RATE,
    apply_markup_to_offer_dict,
    marked_up_amount,
    seat_services_cost,
)


class _FakePassenger:
    def __init__(self, id: str, seat_service_id: str | None):
        self.id = id
        self.seat_service_id = seat_service_id


def _seat_map(elements: list[dict]) -> dict:
    return {"cabins": [{"rows": [{"sections": [{"elements": elements}]}]}]}


def test_seat_services_cost_sums_matching_passenger_picks():
    seat_maps = [
        _seat_map(
            [
                {
                    "designator": "14C",
                    "available_services": [
                        {
                            "id": "ase_1",
                            "passenger_id": "pas_1",
                            "total_amount": "15.00",
                            "total_currency": "USD",
                        }
                    ],
                },
                {
                    "designator": "14D",
                    "available_services": [
                        {
                            "id": "ase_2",
                            "passenger_id": "pas_2",
                            "total_amount": "5.00",
                            "total_currency": "USD",
                        }
                    ],
                },
            ]
        )
    ]
    passengers = [
        _FakePassenger("pas_1", "ase_1"),
        _FakePassenger("pas_2", "ase_2"),
    ]

    assert seat_services_cost(seat_maps, passengers) == ("20.00", "USD")


def test_seat_services_cost_ignores_a_service_id_not_owned_by_that_passenger():
    """Defense against a tampered request: a client-supplied seat_service_id
    that the seat map says belongs to a DIFFERENT passenger must not be
    priced in - otherwise a passenger could claim someone else's cheaper
    (or free) seat by swapping IDs."""
    seat_maps = [
        _seat_map(
            [
                {
                    "designator": "14C",
                    "available_services": [
                        {
                            "id": "ase_1",
                            "passenger_id": "pas_1",
                            "total_amount": "15.00",
                            "total_currency": "USD",
                        }
                    ],
                }
            ]
        )
    ]
    passengers = [_FakePassenger("pas_2", "ase_1")]

    assert seat_services_cost(seat_maps, passengers) is None


def test_seat_services_cost_none_when_no_passenger_picked_a_seat():
    assert seat_services_cost([], [_FakePassenger("pas_1", None)]) is None


def test_marked_up_amount():
    assert marked_up_amount("100.00") == f"{100 * (1 + MARKUP_RATE):.2f}"
    assert marked_up_amount("100.00") == "107.00"


def test_apply_markup_to_offer_dict_folds_markup_into_tax_not_base():
    offer = {"base_amount": "80.00", "tax_amount": "20.00", "total_amount": "100.00"}

    result = apply_markup_to_offer_dict(offer)

    assert result["base_amount"] == "80.00"  # untouched - airline's genuine fare
    assert result["total_amount"] == "107.00"
    assert result["tax_amount"] == "27.00"  # 20.00 + the 7.00 markup
    # breakdown still sums to the total, so fare/tax UI stays consistent
    assert float(result["base_amount"]) + float(result["tax_amount"]) == float(
        result["total_amount"]
    )


def test_apply_markup_to_offer_dict_without_tax_amount():
    """Some offers have a null tax_amount - markup should still land on
    total_amount without crashing on the missing tax field."""
    offer = {"base_amount": None, "tax_amount": None, "total_amount": "50.00"}

    result = apply_markup_to_offer_dict(offer)

    assert result["total_amount"] == "53.50"
    assert result["tax_amount"] is None


def test_apply_markup_to_offer_dict_missing_total_amount_is_a_noop():
    offer = {"base_amount": "10.00", "tax_amount": "1.00"}
    assert apply_markup_to_offer_dict(offer) == offer
