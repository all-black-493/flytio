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

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}
