/**
 * flyt's margin. The 7% covers Pesapal's processing fee plus what the
 * business keeps, and it is the only revenue mechanism - there is no other.
 *
 * Ported from backend/utils/pricing.py, which is still the live
 * implementation. The two must agree while both run.
 */
export const MARKUP_RATE = 0.07;

/** Minor units (cents), so arithmetic never touches a float. */
export type Money = {
  readonly amount: bigint;
  readonly currency: string;
};

export function money(amount: bigint, currency: string): Money {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`not an ISO 4217 currency: ${currency}`);
  }
  return { amount, currency };
}

/**
 * What the traveller is charged, given what the supplier charges flyt.
 *
 * Rounds half-up on the minor unit. The Python side formats with `:.2f`,
 * which rounds half-to-even - they diverge on exact half-cents, which no
 * supplier total has produced. Worth revisiting if one ever does.
 */
export function markedUp(supplierCost: Money): Money {
  const scaled = supplierCost.amount * 107n;
  const rounded = (scaled + 50n) / 100n;
  return money(rounded, supplierCost.currency);
}

/** flyt's take. What the customer pays minus what the supplier is owed. */
export function margin(supplierCost: Money): Money {
  return money(markedUp(supplierCost).amount - supplierCost.amount, supplierCost.currency);
}
