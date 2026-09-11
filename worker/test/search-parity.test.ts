/**
 * Drives the real router - contract, procedures, supplier mapping and all -
 * against a recorded Duffel response, and asserts the JSON matches what the
 * FastAPI service returns for the same input. Regenerate the reference with:
 *
 *   PYTHONPATH=. uv run --project backend python worker/test/parity_reference.py
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { router } from "@interfaces/http/router";
import { matchFastApiValidationStatus } from "@interfaces/http/fastapi-errors";
import { duffelFlightSupplier, duffelPlaceSupplier } from "@infrastructure/suppliers/duffel";
import { noopCache } from "@infrastructure/cache/kv-cache";
import { systemClock } from "@infrastructure/clock";
import type { RequestContext } from "@interfaces/http/context";

// Relative to the package root, which is where vitest runs. The Workers `URL`
// this project types against is not the one node:fs accepts.
const duffel = readFileSync("test/fixtures/duffel-search.json", "utf8");
const reference = JSON.parse(readFileSync("test/fixtures/fastapi-search.json", "utf8")) as Record<
  string,
  { status: number; body: unknown }
>;

const MARKUP_RATE = 0.07;

const unreachable = () => {
  throw new Error("not part of this comparison");
};

const context: RequestContext = {
  clock: systemClock,
  healthChecks: {},
  routes: { popularRoutes: unreachable },
  places: duffelPlaceSupplier("test"),
  flights: duffelFlightSupplier("test"),
  markup: { activeRate: async () => MARKUP_RATE },
  placesCache: noopCache(),
  searchCache: noopCache(),
  accounts: { byEmail: unreachable, credentialByEmail: unreachable },
  tokens: { verify: unreachable },
  credential: null,
  passwords: { verify: unreachable },
  signer: { sign: unreachable },
  cookiePolicy: { domain: null, secure: true, lifetimeMinutes: 60 },
};

const handler = new OpenAPIHandler(router, { interceptors: [matchFastApiValidationStatus] });

const TRIP = {
  slices: [{ origin: "NBO", destination: "DXB", departure_date: "2099-10-01" }],
  passengers: [{ type: "adult" }],
};

async function search(view: string) {
  const { matched, response } = await handler.handle(
    new Request(`https://api.flyt.africa/api/v1/shopping/flight-offers?${view}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(TRIP),
    }),
    { prefix: "/api/v1", context },
  );
  if (!matched) throw new Error(`no route matched ${view}`);
  return { status: response!.status, body: await response!.json() };
}

const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async () =>
    new Response(duffel, { headers: { "Content-Type": "application/json" } })) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("byte parity with the FastAPI service", () => {
  for (const view of Object.keys(reference)) {
    it(`?${view}`, async () => {
      // Stringified, so key order counts too: the frontend parses this with
      // zod, but anything caching or diffing it sees the bytes.
      expect(JSON.stringify(await search(view))).toBe(JSON.stringify(reference[view]));
    });
  }
});
