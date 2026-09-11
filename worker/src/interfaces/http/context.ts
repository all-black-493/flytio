import type {
  AccountRepository,
  Cache,
  Clock,
  FlightSupplier,
  HealthCheck,
  MarkupPolicy,
  PlaceSupplier,
  RouteRepository,
  TokenVerifier,
} from "@application/ports";

/** What every procedure receives. Built per request in src/index.ts. */
export type RequestContext = {
  clock: Clock;
  healthChecks: Record<string, HealthCheck>;
  routes: RouteRepository;
  places: PlaceSupplier;
  flights: FlightSupplier;
  markup: MarkupPolicy;
  /** Reference data, cached for a day. */
  placesCache: Cache;
  /** Offer lists, cached for a minute - a different store for a reason. */
  searchCache: Cache;
  accounts: AccountRepository;
  tokens: TokenVerifier;
  /** Whatever the request presented, unverified. Null when it presented none. */
  credential: string | null;
};
