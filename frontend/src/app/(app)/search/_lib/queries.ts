/**
 * Shared query definition, used identically by the server prefetch in
 * page.tsx and the client useInfiniteQuery in
 * _components/results-explorer.tsx — infiniteQueryOptions() keeps the
 * queryKey/queryFn/page-param logic in exactly one place, so the two can
 * never drift out of sync (which would break hydration matching).
 *
 * offset is used as the page param (not Duffel's own opaque cursors),
 * consistent with how backend/schemas/bookings.py's BookingListQueryParams
 * already does plain offset/limit pagination against our own cached/DB
 * data instead of a third-party cursor.
 */

import { infiniteQueryOptions } from "@tanstack/react-query";

import { searchOffers } from "@/lib/api/client";
import type { FlightSearchResponse } from "@/lib/api/schemas";
import { toOfferRequest, type ParsedSearch } from "@/lib/search-params";
import { toOfferListQueryParams, type FilterSortParams } from "./pagination-params";

const PAGE_SIZE = 20;

export function searchOffersInfiniteQuery(search: ParsedSearch, filters: FilterSortParams) {
  return infiniteQueryOptions({
    queryKey: ["flight-offers", search, filters] as const,
    queryFn: ({ pageParam }): Promise<FlightSearchResponse> =>
      searchOffers(toOfferRequest(search), {
        ...toOfferListQueryParams(filters),
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_more ? lastPage.meta.offset + lastPage.meta.limit : undefined,
  });
}
