import { describe, expect, it } from "vitest";
import { place, placeSuggestionsQuery } from "../src/interfaces/http/schemas";

const AIRPORT = {
  id: "arp_nbo_ke", type: "airport" as const, name: "Jomo Kenyatta International",
  iata_code: "NBO", iata_country_code: "KE", iata_city_code: "NBO", icao_code: "HKJK",
  city_name: "Nairobi", latitude: -1.31, longitude: 36.92, time_zone: "Africa/Nairobi",
  airports: null,
};

describe("places contract", () => {
  it("accepts an airport", () => {
    expect(place.parse(AIRPORT)).toEqual(AIRPORT);
  });

  it("accepts a city nesting its airports, which is recursive", () => {
    const city = { ...AIRPORT, id: "cit_nbo_ke", type: "city" as const, airports: [AIRPORT] };
    expect(place.parse(city)).toEqual(city);
  });

  it("accepts text mode", () => {
    expect(placeSuggestionsQuery.parse({ query: "nai" })).toMatchObject({ query: "nai" });
  });

  it("accepts full geographic mode", () => {
    expect(placeSuggestionsQuery.parse({ lat: "-1.3", lng: "36.9", rad: "50000" }))
      .toMatchObject({ lat: -1.3, lng: 36.9, rad: 50000 });
  });

  it("rejects both modes at once, as FastAPI does", () => {
    expect(() => placeSuggestionsQuery.parse({ query: "nai", lat: -1.3, lng: 36.9, rad: 1 })).toThrow();
  });

  it("rejects a partial geographic query", () => {
    expect(() => placeSuggestionsQuery.parse({ lat: -1.3, lng: 36.9 })).toThrow();
  });

  it("rejects an empty query", () => {
    expect(() => placeSuggestionsQuery.parse({})).toThrow();
  });
});
