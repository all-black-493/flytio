import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { asFastApiError, matchFastApiValidationStatus } from "@interfaces/http/fastapi-errors";
import { readConfig } from "@config/env";
import { systemClock } from "@infrastructure/clock";
import { postgresHealthCheck } from "@infrastructure/db/postgres-health";
import { postgresMarkupPolicy } from "@infrastructure/db/markup-policy";
import { postgresRouteRepository } from "@infrastructure/db/route-repository";
import { postgresAccountRepository } from "@infrastructure/db/account-repository";
import { hs256Signer, hs256Verifier } from "@infrastructure/auth/hs256";
import { bcryptHasher } from "@infrastructure/auth/bcrypt";
import { duffelFlightSupplier, duffelPlaceSupplier } from "@infrastructure/suppliers/duffel";
import { kvCache, noopCache } from "@infrastructure/cache/kv-cache";
import { edgeCache } from "@infrastructure/cache/edge-cache";
import { handleHealth } from "@interfaces/http/health-route";
import { router } from "@interfaces/http/router";
import { readCredential } from "@interfaces/http/credentials";
import type { RequestContext } from "@interfaces/http/context";

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
    const connectionString = config.HYPERDRIVE.connectionString;

    const context: RequestContext = {
      clock: systemClock,
      healthChecks: {
        database: postgresHealthCheck(connectionString),
      },
      routes: postgresRouteRepository(connectionString),
      markup: postgresMarkupPolicy(connectionString),
      places: duffelPlaceSupplier(config.DUFFEL_API_TOKEN),
      flights: duffelFlightSupplier(config.DUFFEL_API_TOKEN),
      placesCache: config.PLACES_CACHE ? kvCache(config.PLACES_CACHE) : noopCache(),
      searchCache: edgeCache(caches.default),
      accounts: postgresAccountRepository(connectionString),
      tokens: hs256Verifier(config.SECRET_KEY, () => systemClock.now()),
      credential: readCredential(request),
      passwords: bcryptHasher(),
      signer: hs256Signer(config.SECRET_KEY),
      cookiePolicy: {
        domain: config.COOKIE_DOMAIN ?? null,
        secure: config.COOKIE_SECURE,
        lifetimeMinutes: config.ACCESS_TOKEN_EXPIRE_MINUTES,
      },
    };

    const health = await handleHealth(new URL(request.url).pathname, context);
    if (health) return health;

    const { matched, response } = await handler.handle(request, {
      prefix: "/api/v1",
      context,
    });

    return matched ? asFastApiError(response) : proxyToOrigin(request, config.ORIGIN_URL);
  },
} satisfies ExportedHandler;
