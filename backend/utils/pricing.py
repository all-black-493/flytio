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
