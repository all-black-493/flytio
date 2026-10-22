import { describe, expect, it } from "vitest";
import { checkReadiness } from "../src/application/use-cases/check-readiness";
import type { HealthCheck } from "../src/application/ports";

/**
 * No oRPC, no Cloudflare, no network, no database - the ports are plain
 * objects. If this ever needs a framework to run, a boundary has been crossed.
 */
const clock = { now: () => new Date("2026-09-06T21:00:00.000Z") };
const ok: HealthCheck = { check: async () => ({ status: "healthy", detail: null }) };
const bad: HealthCheck = { check: async () => ({ status: "unhealthy", detail: "refused" }) };
const absent: HealthCheck = { check: async () => ({ status: "not_configured", detail: null }) };
const throws: HealthCheck = {
  check: async () => {
    throw new Error("boom");
  },
};

describe("checkReadiness", () => {
  it("is healthy when every dependency answers", async () => {
    const r = await checkReadiness({ clock, checks: { database: ok, redis: ok } });
    expect(r.status).toBe("healthy");
  });

  it("is degraded when some but not all are down", async () => {
    const r = await checkReadiness({ clock, checks: { database: ok, redis: bad } });
    expect(r.status).toBe("degraded");
  });

  it("is down when every checked dependency is down", async () => {
    const r = await checkReadiness({ clock, checks: { database: bad, redis: bad } });
    expect(r.status).toBe("down");
  });

  it("excludes not_configured rather than counting it as an outage", async () => {
    const r = await checkReadiness({ clock, checks: { database: ok, kafka: absent } });
    expect(r.status).toBe("healthy");
  });

  it("is down, not healthy, when the only checked dependency is absent-and-broken", async () => {
    const r = await checkReadiness({ clock, checks: { database: bad, kafka: absent } });
    expect(r.status).toBe("down");
  });

  it("reports a throwing check as unhealthy rather than propagating", async () => {
    const r = await checkReadiness({ clock, checks: { database: throws } });
    expect(r.services.database).toEqual({ status: "unhealthy", detail: "Error: boom" });
  });

  it("stamps the time from the clock port", async () => {
    const r = await checkReadiness({ clock, checks: {} });
    expect(r.checked_at).toBe("2026-09-06T21:00:00.000Z");
  });

  it("uses snake_case, matching the FastAPI response it replaces", async () => {
    const r = await checkReadiness({ clock, checks: {} });
    expect(Object.keys(r)).toEqual(["status", "checked_at", "services"]);
  });
});
