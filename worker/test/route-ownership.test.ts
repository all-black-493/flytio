/**
 * Which paths this Worker answers and which it hands to the origin.
 *
 * Sign-in costs ~340 ms of CPU here, all of it bcrypt at cost 12, which needs
 * the Paid plan's budget rather than the free plan's 10 ms. Anything still
 * listed as the origin's is unmigrated work, not a platform limit.
 */
import { describe, expect, it } from "vitest";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { router } from "@interfaces/http/router";

const handler = new OpenAPIHandler(router);

async function matches(method: string, path: string) {
  const { matched } = await handler.handle(
    new Request(`https://api.flyt.africa${path}`, {
      method,
      ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
    }),
    { prefix: "/api/v1", context: {} as never },
  );
  return matched;
}

describe("route ownership", () => {
  it.each([
    ["GET", "/api/v1/me"],
    ["GET", "/api/v1/flights/popular-destinations"],
    ["GET", "/api/v1/shopping/places"],
    ["GET", "/api/v1/shopping/flight-offers"],
    ["POST", "/api/v1/shopping/flight-offers"],
  ])("answers %s %s", async (method, path) => {
    expect(await matches(method, path)).toBe(true);
  });

  it.each([
    ["POST", "/api/v1/token"],
    ["POST", "/api/v1/logout"],
  ])("answers %s %s", async (method, path) => {
    expect(await matches(method, path)).toBe(true);
  });

  it.each([
    ["POST", "/api/v1/register/"],
    ["POST", "/api/v1/change-password"],
    ["POST", "/api/v1/reset-password"],
    ["POST", "/api/v1/forgot-password"],
    ["DELETE", "/api/v1/me"],
    ["GET", "/api/v1/bookings"],
    ["POST", "/api/v1/payments/checkout"],
  ])("leaves %s %s to the origin, not yet migrated", async (method, path) => {
    expect(await matches(method, path)).toBe(false);
  });
});
