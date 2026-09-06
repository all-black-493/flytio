import type { Clock, DependencyStatus, HealthCheck } from "@application/ports";

export type ReadinessReport = {
  status: DependencyStatus;
  checkedAt: string;
  services: Record<string, { status: DependencyStatus }>;
};

/**
 * Readiness, not liveness: this reports unhealthy when a dependency is
 * unreachable, which is the condition worth taking an instance out of
 * rotation for. Shape matches the FastAPI /health/ready response so the two
 * are interchangeable while both serve.
 */
export async function checkReadiness(
  deps: { clock: Clock; checks: Record<string, HealthCheck> },
): Promise<ReadinessReport> {
  const names = Object.keys(deps.checks);

  const results = await Promise.all(
    names.map(async (name): Promise<[string, DependencyStatus]> => {
      try {
        await deps.checks[name]!.ping();
        return [name, "healthy"];
      } catch {
        return [name, "unhealthy"];
      }
    }),
  );

  const services = Object.fromEntries(
    results.map(([name, status]) => [name, { status }]),
  );

  return {
    status: results.every(([, s]) => s === "healthy") ? "healthy" : "unhealthy",
    checkedAt: deps.clock.now().toISOString(),
    services,
  };
}
