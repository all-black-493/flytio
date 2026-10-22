import { describe, expect, it } from "vitest";
import { listPopularDestinations } from "../src/application/use-cases/list-popular-destinations";
import { PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS } from "../src/domain/routes/popular-route";
import type { RouteRepository } from "../src/application/ports";

function repositorySpy(): RouteRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async popularRoutes(options) {
      calls.push(options);
      return [];
    },
  };
}

describe("listPopularDestinations", () => {
  it("applies the public threshold, not the staff one", async () => {
    const repo = repositorySpy();
    await listPopularDestinations({ routes: repo }, { limit: 8 });
    expect(repo.calls[0]).toEqual({ limit: 8, minBookings: PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS });
  });

  it("never lets a single booking look popular", () => {
    expect(PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS).toBeGreaterThan(1);
  });

  it("passes the caller's limit through", async () => {
    const repo = repositorySpy();
    await listPopularDestinations({ routes: repo }, { limit: 3 });
    expect(repo.calls[0]).toMatchObject({ limit: 3 });
  });

  it("returns an empty list as a normal result", async () => {
    await expect(
      listPopularDestinations({ routes: repositorySpy() }, { limit: 8 }),
    ).resolves.toEqual([]);
  });
});
