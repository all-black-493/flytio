import { describe, expect, it } from "vitest";
import { DEFAULT_MARKUP_RATE, markedUpAmount, withMarkup } from "../src/domain/pricing/markup";
import type { Offer } from "../src/domain/flights/offer";

const offer = (fields: Partial<Offer>): Offer =>
  ({
    id: "off_1",
    total_amount: "100.00",
    total_currency: "USD",
    base_amount: "80.00",
    tax_amount: "20.00",
    slices: [],
    ...fields,
  }) as Offer;

describe("markup", () => {
  it("charges the supplier cost plus the default 7%", () => {
    expect(markedUpAmount("100.00", DEFAULT_MARKUP_RATE)).toBe("107.00");
  });

  it("uses an active sale's rate instead when one is passed", () => {
    expect(markedUpAmount("100.00", 0.03)).toBe("103.00");
  });

  it("quotes to the minor unit rather than carrying fractions", () => {
    // 1.01 * 1.07 = 1.0807
    expect(markedUpAmount("1.01", DEFAULT_MARKUP_RATE)).toBe("1.08");
  });

  it("folds the margin into tax so base + tax still equals the total", () => {
    const marked = withMarkup(offer({}), DEFAULT_MARKUP_RATE);
    expect(marked.total_amount).toBe("107.00");
    expect(marked.base_amount).toBe("80.00");
    expect(marked.tax_amount).toBe("27.00");
    expect(Number(marked.base_amount) + Number(marked.tax_amount)).toBe(107);
  });

  it("leaves tax alone when the supplier did not break one out", () => {
    expect(withMarkup(offer({ tax_amount: null }), DEFAULT_MARKUP_RATE).tax_amount).toBeNull();
  });

  it("does not mutate the offer it was given", () => {
    const original = offer({});
    withMarkup(original, DEFAULT_MARKUP_RATE);
    expect(original.total_amount).toBe("100.00");
  });
});
