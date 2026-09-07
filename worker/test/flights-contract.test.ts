import { describe, expect, it } from "vitest";
import {
  flightSearchAndListQuery,
  flightSearchQuery,
  offerListQuery,
  offerRequestCreate,
} from "../src/interfaces/http/schemas";

const AHEAD = "2026-10-07";
const TRIP = { origin: "NBO", destination: "DXB", departure_date: AHEAD };

describe("offer list query", () => {
  it("defaults to a cheapest-first first page", () => {
    expect(offerListQuery.parse({})).toEqual({
      sort: "price",
      airlines: [],
      depart_windows: [],
      limit: 20,
      offset: 0,
    });
  });

  it("lifts a single repeated parameter into a list", () => {
    expect(offerListQuery.parse({ airlines: "KQ" }).airlines).toEqual(["KQ"]);
  });

  it("keeps a repeated parameter as the list FastAPI produced", () => {
    expect(offerListQuery.parse({ airlines: ["KQ", "ET"] }).airlines).toEqual(["KQ", "ET"]);
  });

  it("coerces the numeric filters a URL can only carry as text", () => {
    expect(offerListQuery.parse({ max_stops: "1", price_max: "450.5", limit: "5" })).toMatchObject({
      max_stops: 1,
      price_max: 450.5,
      limit: 5,
    });
  });

  it("rejects a page size the response could not sustain", () => {
    expect(() => offerListQuery.parse({ limit: "500" })).toThrow();
  });

  it("rejects a departure window it has no rule for", () => {
    expect(() => offerListQuery.parse({ depart_windows: "lunchtime" })).toThrow();
  });
});

describe("trip query", () => {
  it("defaults to one adult", () => {
    expect(flightSearchQuery.parse(TRIP)).toMatchObject({ adults: 1, children: 0, infants: 0 });
  });

  it("normalises the case a hand-typed URL arrives in", () => {
    expect(flightSearchQuery.parse({ ...TRIP, origin: "nbo" }).origin).toBe("NBO");
  });

  it("rejects a departure that has already happened", () => {
    expect(() => flightSearchQuery.parse({ ...TRIP, departure_date: "2020-01-01" })).toThrow();
  });

  it("rejects a return before the outbound", () => {
    expect(() => flightSearchQuery.parse({ ...TRIP, return_date: "2020-01-01" })).toThrow();
  });

  it("rejects a third connection, which Duffel will not price", () => {
    expect(() => flightSearchQuery.parse({ ...TRIP, max_connections: "3" })).toThrow();
  });

  it("carries the trip and the view together on the GET route", () => {
    const parsed = flightSearchAndListQuery.parse({ ...TRIP, sort: "best", airlines: "KQ" });
    expect(parsed).toMatchObject({ origin: "NBO", sort: "best", airlines: ["KQ"], limit: 20 });
  });
});

describe("offer request body", () => {
  it("accepts slices and passengers", () => {
    const body = offerRequestCreate.parse({
      slices: [{ origin: "nbo", destination: "dxb", departure_date: AHEAD }],
      passengers: [{ type: "adult" }, { age: 4 }],
      cabin_class: "economy",
    });
    expect(body.slices[0]).toMatchObject({ origin: "NBO", destination: "DXB" });
    expect(body.passengers).toEqual([{ type: "adult" }, { age: 4 }]);
  });

  it("rejects a search with no slices", () => {
    expect(() => offerRequestCreate.parse({ slices: [], passengers: [{ type: "adult" }] })).toThrow();
  });

  it("rejects a search with nobody travelling", () => {
    expect(() =>
      offerRequestCreate.parse({ slices: [{ ...TRIP }], passengers: [] }),
    ).toThrow();
  });

  it("rejects an airport code that is not one", () => {
    expect(() =>
      offerRequestCreate.parse({
        slices: [{ ...TRIP, origin: "NAIROBI" }],
        passengers: [{ type: "adult" }],
      }),
    ).toThrow();
  });
});
