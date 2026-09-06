import type { Clock, HealthCheck } from "@application/ports";

/** What every procedure receives. Built per request in src/index.ts. */
export type RequestContext = {
  clock: Clock;
  healthChecks: Record<string, HealthCheck>;
};
