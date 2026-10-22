import type { Clock, HealthCheck, OverallStatus, ServiceHealth } from "@application/ports";

export type ReadinessReport = {
  status: OverallStatus;
  checked_at: string;
  services: Record<string, ServiceHealth>;
};

/** Ported from routers/health.py. not_configured is excluded, not a failure. */
function overall(services: Record<string, ServiceHealth>): OverallStatus {
  const checked = Object.values(services).filter((s) => s.status !== "not_configured");
  const unhealthy = checked.filter((s) => s.status === "unhealthy");

  if (unhealthy.length === 0) return "healthy";
  return unhealthy.length === checked.length ? "down" : "degraded";
}

export async function checkReadiness(deps: {
  clock: Clock;
  checks: Record<string, HealthCheck>;
}): Promise<ReadinessReport> {
  const results = await Promise.all(
    Object.keys(deps.checks).map(async (name): Promise<[string, ServiceHealth]> => {
      try {
        return [name, await deps.checks[name]!.check()];
      } catch (error) {
        // A check that throws is a check that failed; report it, don't 500.
        return [name, { status: "unhealthy", detail: String(error) }];
      }
    }),
  );

  const services = Object.fromEntries(results);

  return {
    status: overall(services),
    checked_at: deps.clock.now().toISOString(),
    services,
  };
}
