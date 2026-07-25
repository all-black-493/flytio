/**
 * Shared query definitions, used identically by the server prefetch in
 * page.tsx and the client useQuery/useInfiniteQuery calls in
 * _components/ — see search/_lib/queries.ts for why queryOptions()/
 * infiniteQueryOptions() are used this way.
 */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { getCurrentUser, listBookings } from "@/lib/api/client";

const BOOKINGS_PAGE_SIZE = 10;

export function meQuery() {
  return queryOptions({
    queryKey: ["me"] as const,
    queryFn: getCurrentUser,
  });
}

export function bookingsQuery() {
  return infiniteQueryOptions({
    queryKey: ["bookings"] as const,
    queryFn: ({ pageParam }) => listBookings({ limit: BOOKINGS_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_more ? lastPage.meta.offset + lastPage.meta.limit : undefined,
  });
}
