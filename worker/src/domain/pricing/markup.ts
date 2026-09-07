import type { Offer } from "@domain/flights/offer";

/**
 * flyt pays Duffel the raw fare from its own prepaid balance and charges the
 * customer the marked-up amount; the difference is the entire revenue
 * mechanism. An admin-scheduled sale can replace the rate for a window, so
 * every caller passes one in rather than reaching for the default.
 */
export const DEFAULT_MARKUP_RATE = 0.07;

/** Decimal strings in and out: fares are money, and JSON numbers are doubles. */
export function markedUpAmount(rawAmount: string, markupRate: number): string {
  return (Number(rawAmount) * (1 + markupRate)).toFixed(2);
}

/**
 * Folds the added margin into tax_amount rather than base_amount, so base +
 * tax still sums to the new total and base_amount stays the airline's genuine
 * fare - the convention travel agencies use for a service fee.
 */
export function withMarkup(offer: Offer, markupRate: number): Offer {
  const rawTotal = Number(offer.total_amount);
  const newTotal = rawTotal * (1 + markupRate);

  return {
    ...offer,
    total_amount: newTotal.toFixed(2),
    tax_amount:
      offer.tax_amount === null
        ? null
        : (Number(offer.tax_amount) + (newTotal - rawTotal)).toFixed(2),
  };
}
