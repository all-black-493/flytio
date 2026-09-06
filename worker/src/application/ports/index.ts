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

export interface HealthCheck {
  /** Resolves when the dependency answered, rejects when it did not. */
  ping(): Promise<void>;
}

export type DependencyStatus = "healthy" | "unhealthy";

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}
