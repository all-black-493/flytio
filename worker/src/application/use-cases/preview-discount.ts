import type { DiscountRepository, MarkupPolicy, OfferPricer } from "@application/ports";
import { checkDiscount, discounted, type DiscountRefusal } from "@domain/pricing/discount";
import { markedUpAmount } from "@domain/pricing/markup";

export type DiscountPreview = {
  original_amount: string;
  discounted_amount: string;
  currency: string;
  discount_percentage: number;
};

export type PreviewOutcome =
  | { ok: true; preview: DiscountPreview }
  | { ok: false; refusal: DiscountRefusal };

/**
 * What a code would save, without committing to anything. Priced off the base
 * fare only - seats and bags are not known yet - so checkout re-validates and
 * re-applies against the real total, which is the authoritative number.
 *
 * The price is re-confirmed with the airline rather than taken from the
 * client: an offer minutes old may no longer cost what it did.
 */
export async function previewDiscount(
  deps: { offers: OfferPricer; discounts: DiscountRepository; markup: MarkupPolicy },
  request: { offerId: string; code: string; now: Date },
): Promise<PreviewOutcome> {
  const priced = await deps.offers.confirmPrice(request.offerId);
  const markupRate = await deps.markup.activeRate(request.now);
  const originalAmount = markedUpAmount(priced.totalAmount, markupRate);

  const discount = await deps.discounts.byCode(request.code);
  const refusal = checkDiscount(discount, request.code, request.now);
  if (refusal) return { ok: false, refusal };

  return {
    ok: true,
    preview: {
      original_amount: originalAmount,
      // Floored at the raw fare: flyt still owes the airline that much.
      discounted_amount: discounted(originalAmount, discount!.discountPercentage, priced.totalAmount),
      currency: priced.totalCurrency,
      discount_percentage: discount!.discountPercentage,
    },
  };
}
