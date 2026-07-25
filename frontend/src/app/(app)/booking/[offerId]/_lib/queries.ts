/**
 * Query definitions for the booking flow, shared between the server
 * prefetch in page.tsx and the client useQuery calls in _components/ —
 * see search/_lib/queries.ts for why queryOptions() is used this way.
 */

import { queryOptions } from "@tanstack/react-query";

import { confirmOfferPrice, getSeatMap } from "@/lib/api/client";

/** Offers expire quickly, so this is deliberately NOT cached across
 * navigations (staleTime 0, the default) - every visit to this page must
 * re-confirm the live price before payment. */
export function offerPriceQuery(offerId: string) {
  return queryOptions({
    queryKey: ["offer-price", offerId] as const,
    queryFn: () => confirmOfferPrice({ offer_id: offerId }),
  });
}

/** Seat maps aren't time-sensitive the way price is; a short staleTime
 * avoids re-fetching if the passenger flips back and forth between steps. */
export function seatMapQuery(offerId: string) {
  return queryOptions({
    queryKey: ["seat-map", offerId] as const,
    queryFn: () => getSeatMap(offerId),
    staleTime: 60 * 1000,
  });
}
