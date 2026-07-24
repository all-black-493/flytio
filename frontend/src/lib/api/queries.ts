/**
 * App-wide (not feature-scoped) query definitions. Feature-specific
 * queries live colocated with their route instead — e.g.
 * src/app/(app)/search/_lib/queries.ts.
 */

import { queryOptions } from "@tanstack/react-query";

import { searchOffers } from "./client";

const TEASER_ROUTE = { origin: "OSL", destination: "JFK" } as const;

function thirtyDaysFromNow(): string {
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
