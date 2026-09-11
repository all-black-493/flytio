/**
 * The seams. Use cases depend on this file and nothing below it, so they run
 * against plain objects. Adapters in infrastructure/ implement these.
 */

export interface Clock {
  now(): Date;
}

/** not_configured: a dependency this environment deliberately lacks. */
export type ServiceStatus = "healthy" | "unhealthy" | "not_configured";
export type OverallStatus = "healthy" | "degraded" | "down";

export type ServiceHealth = {
  status: ServiceStatus;
  detail: string | null;
};

export interface HealthCheck {
  check(): Promise<ServiceHealth>;
}

import type { PopularRoute } from "@domain/routes/popular-route";

export interface RouteRepository {
  popularRoutes(options: { limit: number; minBookings: number }): Promise<PopularRoute[]>;
}

import type { Place, PlaceQuery } from "@domain/places/place";

export interface PlaceSupplier {
  suggest(query: PlaceQuery): Promise<Place[]>;
}

/** Read-through cache. Misses return null rather than throwing. */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

import type { OfferRequestPlan } from "@domain/flights/offer-request";
import type { SearchResult } from "@domain/flights/offer";

export interface FlightSupplier {
  searchOffers(plan: OfferRequestPlan): Promise<SearchResult>;
}

/** The markup in force right now; an admin-scheduled sale can replace it. */
export interface MarkupPolicy {
  activeRate(at: Date): Promise<number>;
}

import type { Account } from "@domain/auth/account";
import type { TokenClaims } from "@domain/auth/access-token";

export interface AccountRepository {
  byEmail(email: string): Promise<Account | null>;
}

/** Returns null for anything it cannot vouch for: bad signature, expired, malformed. */
export interface TokenVerifier {
  verify(token: string): Promise<TokenClaims | null>;
}
