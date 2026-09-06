import { describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);

vi.mock("pg", () => ({
  Client: class {
    connect = connect;
    query = query;
    end = end;
  },
}));

const { postgresHealthCheck } = await import("../src/infrastructure/db/postgres-health");

describe("postgresHealthCheck", () => {
  it("is healthy when the query succeeds", async () => {
    connect.mockResolvedValueOnce(undefined);
    query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    expect(await postgresHealthCheck("postgres://x").check()).toEqual({
      status: "healthy",
      detail: null,
    });
  });

  it("reports the failure rather than throwing", async () => {
    connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await postgresHealthCheck("postgres://x").check();
    expect(result.status).toBe("unhealthy");
    expect(result.detail).toBe("ECONNREFUSED");
  });

  it("closes the client even when the check fails", async () => {
    end.mockClear();
    connect.mockRejectedValueOnce(new Error("nope"));
    await postgresHealthCheck("postgres://x").check();
    expect(end).toHaveBeenCalledOnce();
  });
});
