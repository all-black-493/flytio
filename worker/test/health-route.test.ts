import { describe, expect, it } from "vitest";
import { handleHealth } from "../src/interfaces/http/health-route";
import type { HealthCheck } from "../src/application/ports";

const clock = { now: () => new Date("2026-09-06T21:00:00.000Z") };
const ok: HealthCheck = { check: async () => ({ status: "healthy", detail: null }) };
const bad: HealthCheck = { check: async () => ({ status: "unhealthy", detail: "refused" }) };

/**
 * Captured from the running FastAPI container against staging Neon. The
 * migrated route has to be interchangeable with this, so it is asserted
 * against rather than described.
 */
const LIVE_RESPONSE = {
  status: "healthy",
  checked_at: "2026-09-06T21:37:40.704217Z",
  services: {
    database: { status: "healthy", detail: null },
    redis: { status: "healthy", detail: null },
  },
};

describe("health route", () => {
  it("matches the live FastAPI response shape exactly", async () => {
    const res = await handleHealth("/health/ready", {
      clock,
      healthChecks: { database: ok, redis: ok },
    });
    const body = await res!.json();

    expect(Object.keys(body as object).sort()).toEqual(Object.keys(LIVE_RESPONSE).sort());
    expect(body).toEqual({ ...LIVE_RESPONSE, checked_at: "2026-09-06T21:00:00.000Z" });
  });

  it("answers 200 when healthy", async () => {
    const res = await handleHealth("/health/ready", { clock, healthChecks: { database: ok } });
    expect(res!.status).toBe(200);
  });

  it("answers 503 when a dependency is down, with the same body shape", async () => {
    const res = await handleHealth("/health/ready", {
      clock,
      healthChecks: { database: ok, redis: bad },
    });
    expect(res!.status).toBe(503);
    const body = (await res!.json()) as { status: string };
    expect(body.status).toBe("degraded");
  });

  it("does not 503 on /health, only on /health/ready", async () => {
    const res = await handleHealth("/health", { clock, healthChecks: { database: bad } });
    expect(res!.status).toBe(200);
  });

  it("liveness checks nothing and always answers", async () => {
    const res = await handleHealth("/health/live", { clock, healthChecks: { database: bad } });
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ status: "alive" });
  });

  it("returns null for a path it does not own, so the proxy takes it", async () => {
    expect(await handleHealth("/api/v1/flights/search", { clock, healthChecks: {} })).toBeNull();
  });
});
