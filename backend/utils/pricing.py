"""Customer-facing markup on top of Duffel's raw (net) fares. flyt pays
Duffel the raw fare from its own prepaid balance (see crud/payments.py's
finalize_payment) and charges the customer the marked-up amount below;
the difference is flyt's margin - this is the entire revenue mechanism,
there is currently no other charge anywhere in the booking flow.
"""

MARKUP_RATE = 0.07  # 7%: covers Pesapal's processing fee (~3%) plus
# margin, while staying close enough to raw NDC fares to not price flyt
# out against metasearch sites showing unmarked-up prices.


def marked_up_amount(raw_amount: str) -> str:
    return f"{float(raw_amount) * (1 + MARKUP_RATE):.2f}"


def seat_services_cost(
    seat_maps: list[dict], passengers: list
) -> tuple[str, str] | None:
    """Sums the price of every passenger's picked seat (OrderPassenger.
    seat_service_id) so checkout can charge for it up front, before the
    order is ever created with Duffel (Duffel requires payments[].amount
    to exactly match the order's real total, services included).

    Looks prices up from Duffel's own seat-map response rather than
    trusting a client-supplied amount - a service id the seat map doesn't
    actually offer to that specific passenger is silently ignored, the
    same as picking an unavailable seat already fails soft elsewhere.
    Returns (amount, currency) or None if no passenger picked a paid seat.
    """
    service_index: dict[str, tuple[str, str, str]] = {}
    for seat_map in seat_maps:
        for cabin in seat_map.get("cabins", []):
            for row in cabin.get("rows", []):
                for section in row.get("sections", []):
                    for element in section.get("elements", []):
                        for service in element.get("available_services") or []:
                            service_index[service["id"]] = (
                                service["passenger_id"],
                                service["total_amount"],
                                service["total_currency"],
                            )

    total = 0.0
    currency: str | None = None
    for passenger in passengers:
        seat_service_id = getattr(passenger, "seat_service_id", None)
        if not seat_service_id:
            continue
        match = service_index.get(seat_service_id)
        if match is None or match[0] != passenger.id:
            continue
        total += float(match[1])
        currency = match[2]

    if total == 0.0 or currency is None:
        return None
    return f"{total:.2f}", currency


def apply_markup_to_offer_dict(offer: dict) -> dict:
    """Marks up an Offer/OfferGroup member's total_amount in place, folding
    the added margin into tax_amount (not base_amount) so base + tax still
    sums to the new total - base_amount stays the airline's genuine fare,
    tax_amount absorbs the markup, the same convention real travel
    agencies use for a service fee."""
    if offer.get("total_amount") is None:
        return offer

    raw_total = float(offer["total_amount"])
    new_total = raw_total * (1 + MARKUP_RATE)
    offer["total_amount"] = f"{new_total:.2f}"

    if offer.get("tax_amount") is not None:
        offer["tax_amount"] = (
            f"{float(offer['tax_amount']) + (new_total - raw_total):.2f}"
        )

    return offer
