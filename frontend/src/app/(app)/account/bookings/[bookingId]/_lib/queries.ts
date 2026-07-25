/**
 * Query definition for a single booking, shared between the server
 * prefetch in page.tsx and the client useQuery call in _components/ —
 * see account/_lib/queries.ts for why queryOptions() is used this way.
 */

import { queryOptions } from "@tanstack/react-query";

import { getBookingById } from "@/lib/api/client";

export function bookingDetailQuery(bookingId: string) {
  return queryOptions({
    queryKey: ["booking", bookingId] as const,
    queryFn: () => getBookingById(bookingId),
  });
}
