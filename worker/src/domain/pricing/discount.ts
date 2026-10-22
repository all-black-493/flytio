/**
 * A percentage-off code a customer types at checkout. Percentage only: a flat
 * amount would need a currency attached and would not apply across bookings
 * priced in different ones.
 */
export type DiscountCode = {
  code: string;
  discountPercentage: number;
  /** Null means unlimited. */
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: Date | null;
  isActive: boolean;
};

export type DiscountRefusal =
  | { reason: "unknown"; message: string }
  | { reason: "inactive"; message: string }
  | { reason: "expired"; message: string }
  | { reason: "exhausted"; message: string };

/**
 * Whether a code can be used right now. The messages are shown to the
 * customer verbatim, so they say which of the four it is - the code itself is
 * something they typed, not a secret worth protecting.
 *
 * Checking is separate from redeeming: a code is only ever burned once a
 * booking it was applied to actually completes, so an abandoned checkout does
 * not cost a limited code one of its uses.
 */
export function checkDiscount(
  discount: DiscountCode | null,
  typed: string,
  now: Date,
): DiscountRefusal | null {
  if (discount === null) return { reason: "unknown", message: `"${typed}" isn't a valid discount code.` };
  if (!discount.isActive) return { reason: "inactive", message: `"${discount.code}" is no longer active.` };
  if (discount.expiresAt !== null && discount.expiresAt < now) {
    return { reason: "expired", message: `"${discount.code}" has expired.` };
  }
  if (discount.maxRedemptions !== null && discount.timesRedeemed >= discount.maxRedemptions) {
    return { reason: "exhausted", message: `"${discount.code}" has already been fully redeemed.` };
  }
  return null;
}

/**
 * Takes a percentage off an already-marked-up amount, floored at what flyt
 * owes the airline for the ticket. A discount bigger than the markup means
 * flyt earns nothing on that booking - never that it pays out of pocket.
 */
export function discounted(amount: string, percentage: number, floorAmount: string): string {
  const reduced = Number(amount) * (1 - percentage / 100);
  return Math.max(reduced, Number(floorAmount)).toFixed(2);
}
