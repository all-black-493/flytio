import type { Cache, FlightSupplier, MarkupPolicy } from "@application/ports";
import type { SearchResult } from "@domain/flights/offer";
import type { OfferRequestPlan } from "@domain/flights/offer-request";
import { buildFlightSearchResult, type FlightSearchResult, type OfferView } from "@domain/flights/search";

/** Offers expire fast, so this is only enough to absorb a filter or page change. */
export const SEARCH_CACHE_TTL_SECONDS = 60;

/**
 * Keyed on the shopping request alone. The view (sort, filters, page) is
 * applied afterwards, so every combination of it reuses one supplier call.
 */
export function searchCacheKey(plan: OfferRequestPlan): string {
  const slices = plan.slices.map((s) => `${s.origin}-${s.destination}@${s.departureDate}`);
  const passengers = plan.passengers.map((p) => p.type ?? `age:${p.age}`);
  return [
    "flights:search",
    slices.join(","),
    passengers.join(","),
    plan.cabinClass ?? "-",
    plan.maxConnections ?? "-",
  ].join(":");
}

export async function searchFlights(
  deps: { flights: FlightSupplier; cache: Cache; markup: MarkupPolicy },
  request: { plan: OfferRequestPlan; view: OfferView; at: Date },
): Promise<FlightSearchResult> {
  const key = searchCacheKey(request.plan);

  let result = await deps.cache.get<SearchResult>(key);
  if (!result) {
    result = await deps.flights.searchOffers(request.plan);
    await deps.cache.set(key, result, SEARCH_CACHE_TTL_SECONDS);
  }

  // Resolved per request, never cached with the offers: a sale starting or
  // ending on schedule must not be a request behind.
  const markupRate = await deps.markup.activeRate(request.at);
  return buildFlightSearchResult(result, request.view, markupRate);
}
