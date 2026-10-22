import type { RouteRepository } from "@application/ports";
import {
  PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS,
  type PopularRoute,
} from "@domain/routes/popular-route";

/**
 * An empty list is a normal response - the frontend hides the section rather
 * than showing an empty box.
 */
export async function listPopularDestinations(
  deps: { routes: RouteRepository },
  input: { limit: number },
): Promise<PopularRoute[]> {
  return deps.routes.popularRoutes({
    limit: input.limit,
    minBookings: PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS,
  });
}
