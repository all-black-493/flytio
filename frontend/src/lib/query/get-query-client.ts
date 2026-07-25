/**
 * Per-request QueryClient on the server, a browser singleton on the
 * client — the standard TanStack Query + Next.js App Router pattern, so a
 * server prefetch's cache can be dehydrated and handed to the client via
 * HydrationBoundary without ever sharing a client across requests.
 */

import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // matches the backend's own 60s Redis cache window for searches
        staleTime: 60 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client.
    return makeQueryClient();
  }
  // Browser: reuse the singleton so we don't throw away cached data (and
  // any in-flight suspended query) on every re-render.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
