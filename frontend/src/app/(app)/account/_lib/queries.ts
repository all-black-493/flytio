/**
 * Shared query definitions, used identically by the server prefetch in
 * page.tsx and the client useQuery/useInfiniteQuery calls in
 * _components/ — see search/_lib/queries.ts for why queryOptions()/
 * infiniteQueryOptions() are used this way.
 */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { getBookingRefund, getCurrentUser, listBookings } from "@/lib/api/client";
import { FIRST_PAGE, nextCursor } from "@/lib/api/pagination";

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
    queryFn: ({ pageParam }) => listBookings({ size: BOOKINGS_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: nextCursor,
  });
}

/** A booking's refund, if one is owed. Resolves to null (not an error)
 * when there isn't one - see getBookingRefund - so the component simply
 * renders nothing for the overwhelmingly common uncancelled case. */
export function bookingRefundQuery(bookingId: string) {
  return queryOptions({
    queryKey: ["booking", bookingId, "refund"] as const,
    queryFn: () => getBookingRefund(bookingId),
  });
}
