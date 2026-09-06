import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { onError } from "@orpc/server";
import { readConfig } from "@config/env";
import { systemClock } from "@infrastructure/clock";
import { handleHealth } from "@interfaces/http/health-route";
import { router } from "@interfaces/http/router";

const handler = new OpenAPIHandler(router, {
  interceptors: [onError((error) => console.error(error))],
});

/**
 * Strangler fig. Routes this Worker owns are served here; everything else is
 * forwarded to the origin unchanged, so migrating a route is additive and
 * reverting one is deleting it. The fallback goes when the last route moves.
 */
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
      // Real dependencies land in CF-25. Until then readiness reports on
      // nothing, which is honest rather than a green light.
      healthChecks: {},
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
