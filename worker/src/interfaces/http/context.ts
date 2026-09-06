import type { Clock, HealthCheck, RouteRepository } from "@application/ports";

/** What every procedure receives. Built per request in src/index.ts. */
export type RequestContext = {
  clock: Clock;
  healthChecks: Record<string, HealthCheck>;
  routes: RouteRepository;
};
