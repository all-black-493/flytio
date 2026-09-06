import { describe, expect, it } from "vitest";
import { checkReadiness } from "../src/application/use-cases/check-readiness";

/**
 * No oRPC, no Cloudflare, no network, no database - the ports are plain
 * objects. If this test ever needs a framework to run, a layer boundary has
 * been crossed.
 */
const clock = { now: () => new Date("2026-09-06T21:00:00.000Z") };
const up = { ping: async () => {} };
const down = {
  ping: async () => {
    throw new Error("connection refused");
  },
};

describe("checkReadiness", () => {
  it("is healthy when every dependency answers", async () => {
    const report = await checkReadiness({ clock, checks: { database: up, redis: up } });
    expect(report.status).toBe("healthy");
    expect(report.services).toEqual({
      database: { status: "healthy" },
      redis: { status: "healthy" },
    });
  });

  it("is unhealthy when any one does not", async () => {
    const report = await checkReadiness({ clock, checks: { database: up, redis: down } });
    expect(report.status).toBe("unhealthy");
    expect(report.services.redis).toEqual({ status: "unhealthy" });
  });

  it("reports the failing dependency rather than throwing", async () => {
    await expect(checkReadiness({ clock, checks: { database: down } })).resolves.toBeDefined();
  });

  it("stamps the time from the clock port, not the wall clock", async () => {
    const report = await checkReadiness({ clock, checks: {} });
    expect(report.checkedAt).toBe("2026-09-06T21:00:00.000Z");
  });
});
