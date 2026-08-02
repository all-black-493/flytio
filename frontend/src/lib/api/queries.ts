/**
 * App-wide (not feature-scoped) query definitions. Feature-specific
 * queries live colocated with their route instead — e.g.
 * src/app/(app)/search/_lib/queries.ts.
 */

import { queryOptions } from "@tanstack/react-query";

import { getPopularDestinations, searchOffers } from "./client";

const TEASER_ROUTE = { origin: "OSL", destination: "JFK" } as const;

/** Default departure origin for entry points that don't have one of
 * their own yet (e.g. clicking a popular destination) - matches this
 * app's Kenya-outbound framing; the traveler can change it once they
 * land on /search, same as every other entry point into search. */
export const DEFAULT_ORIGIN_IATA_CODE = "NBO";

export function thirtyDaysFromNow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

/** A small curated search that powers the marketing landing page's
 * departures-board teaser — real live fares, not the old static sample
 * data, but not meant to represent "today's search results" either. */
export function departureBoardQuery() {
  return queryOptions({
    queryKey: ["departure-board", TEASER_ROUTE.origin, TEASER_ROUTE.destination] as const,
    queryFn: () =>
      searchOffers(
        {
          slices: [
            {
              origin: TEASER_ROUTE.origin,
              destination: TEASER_ROUTE.destination,
              departure_date: thirtyDaysFromNow(),
            },
          ],
          passengers: [{ type: "adult" }],
        },
        { limit: 5 },
      ),
    // the board's own footer says "fares refresh every 60 seconds"
    refetchInterval: 60 * 1000,
  });
}

/** Real bookings only - the backend already filters out anything below
 * its real-signal threshold (routers/flights.py's
 * PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS), so an empty array here is a normal
 * "not enough data yet" response, not an error. */
export function popularDestinationsQuery() {
  return queryOptions({
    queryKey: ["popular-destinations"] as const,
    queryFn: () => getPopularDestinations(),
  });
}
