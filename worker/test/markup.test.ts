import { describe, expect, it } from "vitest";
import { margin, markedUp, money } from "../src/domain/pricing/markup";

describe("markup", () => {
  it("charges the supplier cost plus 7%", () => {
    expect(markedUp(money(10000n, "USD"))).toEqual(money(10700n, "USD"));
  });

  it("rounds to the minor unit rather than carrying fractions", () => {
    // 1.01 * 1.07 = 1.0807 -> 108 cents
    expect(markedUp(money(101n, "USD")).amount).toBe(108n);
  });

  it("margin is what the customer pays above the supplier", () => {
    expect(margin(money(10000n, "USD")).amount).toBe(700n);
  });

  it("refuses a currency that is not ISO 4217", () => {
    expect(() => money(1n, "dollars")).toThrow();
  });

  it("never produces a float", () => {
    expect(typeof markedUp(money(333n, "KES")).amount).toBe("bigint");
  });
});
