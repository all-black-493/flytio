/** Covers Pesapal's fee plus margin. flyt's only revenue mechanism. */
export const MARKUP_RATE = 0.07;

/** Minor units, so arithmetic never touches a float. */
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
 * Rounds half-up; Python's `:.2f` rounds half-to-even. They differ only on
 * exact half-cents, which no supplier total has produced. Both run for now.
 */
export function markedUp(supplierCost: Money): Money {
  const rounded = (supplierCost.amount * 107n + 50n) / 100n;
  return money(rounded, supplierCost.currency);
}

export function margin(supplierCost: Money): Money {
  return money(markedUp(supplierCost).amount - supplierCost.amount, supplierCost.currency);
}
