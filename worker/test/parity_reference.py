"""Regenerates test/fixtures/fastapi-search.json - what the FastAPI service
returns for the recorded Duffel response in duffel-search.json, across every
sort and filter. test/search-parity.test.ts asserts the Worker matches it.

  PYTHONPATH=. uv run --project backend python worker/test/parity_reference.py
"""

import json
import pathlib
import sys

from backend.schemas.duffel_flights import OfferListQueryParams
from backend.utils.offer_filtering import build_flight_search_response

MARKUP_RATE = 0.07

VIEWS = [
    "sort=price",
    "sort=best",
    "sort=duration",
    "sort=departure",
    "sort=arrival",
    "sort=price&airlines=KQ&airlines=EK",
    "sort=price&max_stops=0",
    "sort=price&price_max=600",
    "sort=price&depart_windows=morning&depart_windows=night",
    "sort=price&max_duration_minutes=400",
    "sort=best&limit=2&offset=1",
]

LISTS = {"airlines", "depart_windows"}


def params_from(view: str) -> OfferListQueryParams:
    fields: dict = {}
    for pair in view.split("&"):
        key, value = pair.split("=")
        if key in LISTS:
            fields.setdefault(key, []).append(value)
        else:
            fields[key] = value
    return OfferListQueryParams.model_validate(fields)


def main() -> None:
    here = pathlib.Path(__file__).parent / "fixtures"
    duffel = json.loads((here / "duffel-search.json").read_text())

    captured = {
        view: {
            "status": 200,
            "body": build_flight_search_response(
                json.loads(json.dumps(duffel)), params_from(view), MARKUP_RATE
            ).model_dump(mode="json"),
        }
        for view in VIEWS
    }

    (here / "fastapi-search.json").write_text(json.dumps(captured, indent=2) + "\n")
    print(f"wrote {len(VIEWS)} views", file=sys.stderr)


if __name__ == "__main__":
    main()
