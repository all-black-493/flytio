import type { Cache, PlaceSupplier } from "@application/ports";
import type { Place, PlaceQuery } from "@domain/places/place";

/** Airport and city reference data barely changes. */
export const PLACES_CACHE_TTL_SECONDS = 86_400;

function cacheKey(query: PlaceQuery): string {
  return "text" in query
    ? `places:text:${query.text.toLowerCase()}`
    : `places:geo:${query.lat}:${query.lng}:${query.radiusMetres}`;
}

export async function suggestPlaces(
  deps: { places: PlaceSupplier; cache: Cache },
  query: PlaceQuery,
): Promise<Place[]> {
  const key = cacheKey(query);

  const hit = await deps.cache.get<Place[]>(key);
  if (hit) return hit;

  const found = await deps.places.suggest(query);
  await deps.cache.set(key, found, PLACES_CACHE_TTL_SECONDS);
  return found;
}
