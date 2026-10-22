import { describe, expect, it } from "vitest";
import { PLACES_CACHE_TTL_SECONDS, suggestPlaces } from "../src/application/use-cases/suggest-places";
import type { Cache, PlaceSupplier } from "../src/application/ports";
import type { Place } from "../src/domain/places/place";

const NBO: Place = {
  id: "arp_nbo_ke", type: "airport", name: "Jomo Kenyatta International",
  iataCode: "NBO", iataCountryCode: "KE", iataCityCode: "NBO", icaoCode: "HKJK",
  cityName: "Nairobi", latitude: -1.31, longitude: 36.92, timeZone: "Africa/Nairobi",
  airports: null,
};

function supplierSpy(result: Place[] = [NBO]) {
  const calls: unknown[] = [];
  const supplier: PlaceSupplier = {
    async suggest(query) { calls.push(query); return result; },
  };
  return { supplier, calls };
}

function memoryCache(): Cache & { writes: { key: string; ttl: number }[] } {
  const store = new Map<string, unknown>();
  const writes: { key: string; ttl: number }[] = [];
  return {
    writes,
    async get<T>(key: string) { return (store.get(key) as T) ?? null; },
    async set<T>(key: string, value: T, ttl: number) { store.set(key, value); writes.push({ key, ttl }); },
  };
}

describe("suggestPlaces", () => {
  it("asks the supplier on a miss and caches for a day", async () => {
    const { supplier, calls } = supplierSpy();
    const cache = memoryCache();
    await suggestPlaces({ places: supplier, cache }, { text: "nairobi" });
    expect(calls).toHaveLength(1);
    expect(cache.writes[0]?.ttl).toBe(PLACES_CACHE_TTL_SECONDS);
  });

  it("does not touch the supplier on a hit", async () => {
    const { supplier, calls } = supplierSpy();
    const cache = memoryCache();
    await suggestPlaces({ places: supplier, cache }, { text: "nairobi" });
    await suggestPlaces({ places: supplier, cache }, { text: "nairobi" });
    expect(calls).toHaveLength(1);
  });

  it("treats case as the same query", async () => {
    const { supplier, calls } = supplierSpy();
    const cache = memoryCache();
    await suggestPlaces({ places: supplier, cache }, { text: "Nairobi" });
    await suggestPlaces({ places: supplier, cache }, { text: "nairobi" });
    expect(calls).toHaveLength(1);
  });

  it("keys geographic searches separately from text", async () => {
    const { supplier, calls } = supplierSpy();
    const cache = memoryCache();
    await suggestPlaces({ places: supplier, cache }, { text: "nairobi" });
    await suggestPlaces({ places: supplier, cache }, { lat: -1.3, lng: 36.9, radiusMetres: 50000 });
    expect(calls).toHaveLength(2);
  });
});
