"""Regression test: Duffel sends `available_services` as an explicit
`null` (not just an omitted key) when there's nothing to offer - a plain
Pydantic `= []` default only covers a missing key, not an explicit None,
and previously raised a validation error on every such offer (i.e. most
real search results), breaking search entirely."""

from backend.schemas.duffel_flights import Offer


def _offer(**overrides) -> dict:
    payload = {"id": "off_test123", "total_amount": "100.00", "total_currency": "USD"}
    payload.update(overrides)
    return payload


def test_offer_accepts_explicit_null_available_services():
    offer = Offer.model_validate(_offer(available_services=None))
    assert offer.available_services == []


def test_offer_accepts_missing_available_services():
    offer = Offer.model_validate(_offer())
    assert offer.available_services == []


def test_offer_accepts_populated_available_services():
    offer = Offer.model_validate(
        _offer(
            available_services=[
                {
                    "id": "ase_1",
                    "type": "baggage",
                    "total_amount": "30.00",
                    "total_currency": "USD",
                    "passenger_ids": ["pas_1"],
                }
            ]
        )
    )
    assert len(offer.available_services) == 1
    assert offer.available_services[0].id == "ase_1"
