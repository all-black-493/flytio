/**
 * What the application needs the world to provide.
 *
 * These are the seams. A use case depends on this file and nothing below it,
 * so it can be exercised with plain objects - no network, no database, no
 * Cloudflare. Adapters in infrastructure/ implement these; nothing here may
 * import from there.
 */

export interface Clock {
  now(): Date;
}

/** not_configured is a dependency this environment deliberately lacks. */
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
