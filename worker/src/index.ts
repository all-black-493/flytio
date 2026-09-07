import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { matchFastApiValidationStatus } from "@interfaces/http/validation-status";
import { readConfig } from "@config/env";
import { systemClock } from "@infrastructure/clock";
import { postgresHealthCheck } from "@infrastructure/db/postgres-health";
import { postgresRouteRepository } from "@infrastructure/db/route-repository";
import { duffelPlaceSupplier } from "@infrastructure/suppliers/duffel";
import { kvCache, noopCache } from "@infrastructure/cache/kv-cache";
import { handleHealth } from "@interfaces/http/health-route";
import { router } from "@interfaces/http/router";

const handler = new OpenAPIHandler(router, {
  interceptors: [matchFastApiValidationStatus],
});

/** Strangler fig: unowned routes go to the origin, so migrating one is additive. */
async function proxyToOrigin(request: Request, originUrl: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, originUrl);

  return fetch(
    new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    const config = readConfig(env);
    const context = {
      clock: systemClock,
      healthChecks: {
        database: postgresHealthCheck(config.HYPERDRIVE.connectionString),
      },
      routes: postgresRouteRepository(config.HYPERDRIVE.connectionString),
      places: duffelPlaceSupplier(config.DUFFEL_API_TOKEN),
      cache: config.PLACES_CACHE ? kvCache(config.PLACES_CACHE) : noopCache(),
    };

    const health = await handleHealth(new URL(request.url).pathname, context);
    if (health) return health;

    const { matched, response } = await handler.handle(request, {
      prefix: "/api/v1",
      context,
    });

    return matched ? response : proxyToOrigin(request, config.ORIGIN_URL);
  },
} satisfies ExportedHandler;
