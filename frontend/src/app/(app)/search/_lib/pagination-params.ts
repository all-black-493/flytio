/**
 * URL contract for the results page's view state: filters, sort, and (via
 * queries.ts's infinite query) pagination. Kept separate from the shared
 * lib/search-params.ts, which only covers "what flights are we shopping
 * for" (origin/destination/dates/passengers) — that contract is also used
 * by the home page's SearchCard, which has no filters/sort of its own.
 */

import type { OfferListQueryParams, OfferSortKey } from "@/lib/api/types";

export interface FilterSortParams {
  sort: OfferSortKey;
  airlines: string[];
  maxStops: number | null;
  priceMax: number | null;
}

export const DEFAULT_FILTER_SORT: FilterSortParams = {
  sort: "price",
  airlines: [],
  maxStops: null,
  priceMax: null,
};

const SORT_KEYS: OfferSortKey[] = ["price", "duration", "departure", "arrival"];

/** Takes the same flattened record lib/search-params.ts's
 * flattenSearchParams() produces, so page.tsx only flattens once. */
export function parseFilterSortParams(params: Record<string, string>): FilterSortParams {
  const sort = SORT_KEYS.find((s) => s === params.sort) ?? DEFAULT_FILTER_SORT.sort;
  const airlines = params.airlines ? params.airlines.split(",").filter(Boolean) : [];
  const maxStops = params.max_stops !== undefined ? Number(params.max_stops) : null;
  const priceMax = params.price_max !== undefined ? Number(params.price_max) : null;
  return {
    sort,
    airlines,
    maxStops: Number.isFinite(maxStops) ? maxStops : null,
    priceMax: Number.isFinite(priceMax) ? priceMax : null,
  };
}

export function toOfferListQueryParams(filters: FilterSortParams): OfferListQueryParams {
  return {
    sort: filters.sort,
    airlines: filters.airlines,
    max_stops: filters.maxStops,
    price_max: filters.priceMax,
  };
}

/** Applies a filter/sort change on top of the current URL's search params,
 * returning the new query string — used by filter-sidebar.tsx and
 * sort-dropdown.tsx so a filter change doesn't clobber the other params
 * (origin/destination/dates, or other filters) already in the URL. */
export function withFilterSortParams(
  current: URLSearchParams,
  patch: Partial<FilterSortParams>,
): string {
  const next = new URLSearchParams(current);

  if (patch.sort !== undefined) {
    if (patch.sort === DEFAULT_FILTER_SORT.sort) next.delete("sort");
    else next.set("sort", patch.sort);
  }
  if (patch.airlines !== undefined) {
    if (patch.airlines.length === 0) next.delete("airlines");
    else next.set("airlines", patch.airlines.join(","));
  }
  if (patch.maxStops !== undefined) {
    if (patch.maxStops === null) next.delete("max_stops");
    else next.set("max_stops", String(patch.maxStops));
  }
  if (patch.priceMax !== undefined) {
    if (patch.priceMax === null) next.delete("price_max");
    else next.set("price_max", String(patch.priceMax));
  }

  return next.toString();
}
