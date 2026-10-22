import { describe, expect, it } from "vitest";
import { checkDiscount, discounted, type DiscountCode } from "@domain/pricing/discount";
import { previewDiscount } from "@application/use-cases/preview-discount";

const NOW = new Date("2026-08-10T12:00:00Z");

const CODE: DiscountCode = {
  code: "FLYT10",
  discountPercentage: 10,
  maxRedemptions: null,
  timesRedeemed: 0,
  expiresAt: null,
  isActive: true,
};

describe("whether a code can be used", () => {
  it("accepts a live one", () => {
    expect(checkDiscount(CODE, "FLYT10", NOW)).toBeNull();
  });

  it("refuses one nobody issued", () => {
    expect(checkDiscount(null, "NOPE", NOW)).toEqual({
      reason: "unknown",
      message: `"NOPE" isn't a valid discount code.`,
    });
  });

  it("refuses one that was switched off", () => {
    expect(checkDiscount({ ...CODE, isActive: false }, "FLYT10", NOW)?.reason).toBe("inactive");
  });

  it("refuses one past its expiry", () => {
    const expired = { ...CODE, expiresAt: new Date("2026-08-10T11:59:59Z") };
    expect(checkDiscount(expired, "FLYT10", NOW)?.reason).toBe("expired");
  });

  it("accepts one expiring later today", () => {
    expect(checkDiscount({ ...CODE, expiresAt: new Date("2026-08-10T12:00:01Z") }, "FLYT10", NOW)).toBeNull();
  });

  it("refuses one that has been fully redeemed", () => {
    const spent = { ...CODE, maxRedemptions: 5, timesRedeemed: 5 };
    expect(checkDiscount(spent, "FLYT10", NOW)?.reason).toBe("exhausted");
  });

  it("accepts one with a redemption left", () => {
    expect(checkDiscount({ ...CODE, maxRedemptions: 5, timesRedeemed: 4 }, "FLYT10", NOW)).toBeNull();
  });

  it("names the stored code, not what was typed, once it is found", () => {
    expect(checkDiscount({ ...CODE, isActive: false }, "flyt10", NOW)?.message).toContain("FLYT10");
  });
});

describe("applying a discount", () => {
  it("takes the percentage off", () => {
    // 5% of 107.00 is 5.35, which still leaves more than the 100.00 fare.
    expect(discounted("107.00", 5, "100.00")).toBe("101.65");
  });

  it("never goes below what flyt owes the airline", () => {
    // Worth stating plainly: against a 7% markup, anything above ~6.5% is
    // absorbed entirely by the floor. A 10% code and a 50% code both leave
    // the customer paying the raw fare - the difference is margin flyt gives
    // up, never money it pays out.
    expect(discounted("107.00", 10, "100.00")).toBe("100.00");
    expect(discounted("107.00", 50, "100.00")).toBe("100.00");
  });

  it("earning nothing is the floor, not paying out", () => {
    expect(Number(discounted("107.00", 100, "100.00"))).toBe(100);
  });
});

describe("the preview", () => {
  const deps = (discount: DiscountCode | null) => ({
    offers: { confirmPrice: async () => ({ totalAmount: "100.00", totalCurrency: "USD" }) },
    discounts: { byCode: async () => discount },
    markup: { activeRate: async () => 0.07 },
  });

  it("quotes the marked-up fare and what the code takes off it", async () => {
    const outcome = await previewDiscount(deps({ ...CODE, discountPercentage: 5 }), {
      offerId: "off_1",
      code: "FLYT10",
      now: NOW,
    });
    expect(outcome).toEqual({
      ok: true,
      preview: {
        original_amount: "107.00",
        discounted_amount: "101.65",
        currency: "USD",
        discount_percentage: 5,
      },
    });
  });

  it("uses the sale rate when one is running", async () => {
    const onSale = { ...deps(CODE), markup: { activeRate: async () => 0.03 } };
    const outcome = await previewDiscount(onSale, { offerId: "off_1", code: "FLYT10", now: NOW });
    expect(outcome).toMatchObject({ preview: { original_amount: "103.00" } });
  });

  it("refuses rather than quoting when the code is no good", async () => {
    const outcome = await previewDiscount(deps(null), { offerId: "off_1", code: "NOPE", now: NOW });
    expect(outcome).toEqual({
      ok: false,
      refusal: { reason: "unknown", message: `"NOPE" isn't a valid discount code.` },
    });
  });

  it("re-confirms the price rather than trusting an offer the client held", async () => {
    let asked: string | null = null;
    const watched = {
      ...deps(CODE),
      offers: {
        confirmPrice: async (offerId: string) => {
          asked = offerId;
          return { totalAmount: "250.00", totalCurrency: "KES" };
        },
      },
    };
    const outcome = await previewDiscount(watched, { offerId: "off_live", code: "FLYT10", now: NOW });
    expect(asked).toBe("off_live");
    expect(outcome).toMatchObject({ preview: { currency: "KES", original_amount: "267.50" } });
  });
});
