import { describe, expect, it } from "vitest";
import { popularDestinationsQuery, popularRoute } from "../src/interfaces/http/schemas";

/** Captured from the FastAPI response this route has to stay compatible with. */
const LIVE_ROW = {
  origin_iata_code: "NBO",
  origin_city_name: "Nairobi",
  destination_iata_code: "JFK",
  destination_city_name: "New York",
  booking_count: 12,
  destination_image_url: "https://images.example/jfk.jpg",
  destination_image_attribution_name: "A Photographer",
  destination_image_attribution_url: "https://unsplash.example/p",
};

describe("popular destinations contract", () => {
  it("accepts the live FastAPI row shape", () => {
    expect(popularRoute.parse(LIVE_ROW)).toEqual(LIVE_ROW);
  });

  it("accepts a route with no cached image, which is normal", () => {
    const row = {
      ...LIVE_ROW,
      destination_image_url: null,
      destination_image_attribution_name: null,
      destination_image_attribution_url: null,
    };
    expect(popularRoute.parse(row)).toEqual(row);
  });

  it("rejects an airport code that is not IATA", () => {
    expect(() => popularRoute.parse({ ...LIVE_ROW, origin_iata_code: "Nairobi" })).toThrow();
  });

  it("defaults limit to 8, matching the FastAPI default", () => {
    expect(popularDestinationsQuery.parse({}).limit).toBe(8);
  });

  it("enforces the same 1..20 bound FastAPI does", () => {
    expect(() => popularDestinationsQuery.parse({ limit: 21 })).toThrow();
    expect(() => popularDestinationsQuery.parse({ limit: 0 })).toThrow();
  });

  it("coerces the query string, since URLs carry text", () => {
    expect(popularDestinationsQuery.parse({ limit: "5" }).limit).toBe(5);
  });
});
