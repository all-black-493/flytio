import { z } from "zod";
import { isoDateTime } from "@interfaces/http/schemas/primitives";

/** Mirrors backend/schemas/health.py, snake_case included. Both serve this path. */
export const serviceStatus = z.enum(["healthy", "unhealthy", "not_configured"]);
export const overallStatus = z.enum(["healthy", "degraded", "down"]);

export const serviceHealth = z.object({
  status: serviceStatus,
  detail: z.string().nullable(),
});

export const healthResponse = z.object({
  status: overallStatus,
  checked_at: isoDateTime,
  services: z.record(z.string(), serviceHealth),
});

export type HealthResponse = z.infer<typeof healthResponse>;
