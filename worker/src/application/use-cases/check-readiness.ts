import type {
  Clock,
  HealthCheck,
  OverallStatus,
  ServiceHealth,
} from "@application/ports";

export type ReadinessReport = {
  status: OverallStatus;
  checked_at: string;
  services: Record<string, ServiceHealth>;
};

/**
 * One rule for healthy/degraded/down, ported from routers/health.py so the
 * two implementations cannot disagree about what the same checks mean.
 * not_configured is excluded rather than counted as a failure: a dependency
 * this environment deliberately does not have is not an outage.
 */
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
  const names = Object.keys(deps.checks);

  const results = await Promise.all(
    names.map(async (name): Promise<[string, ServiceHealth]> => {
      try {
        return [name, await deps.checks[name]!.check()];
      } catch (error) {
        // A check that throws is a check that failed; the endpoint reports it
        // rather than 500ing, which is the whole point of asking.
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
