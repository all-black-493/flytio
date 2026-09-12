import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { asFastApiError, matchFastApiValidationStatus } from "@interfaces/http/fastapi-errors";
import { readConfig } from "@config/env";
import { systemClock } from "@infrastructure/clock";
import { postgresHealthCheck } from "@infrastructure/db/postgres-health";
import { postgresMarkupPolicy } from "@infrastructure/db/markup-policy";
import { postgresRouteRepository } from "@infrastructure/db/route-repository";
import { postgresAccountRepository } from "@infrastructure/db/account-repository";
import { postgresBookingRepository } from "@infrastructure/db/booking-repository";
import {
  postgresDepartureReminderRepository,
  postgresNotificationRepository,
} from "@infrastructure/db/reminder-repository";
import { hs256Signer, hs256Verifier } from "@infrastructure/auth/hs256";
import { bcryptHasher } from "@infrastructure/auth/bcrypt";
import { resendHtmlMailer, resendMailer } from "@infrastructure/mail/resend";
import { duffelFlightSupplier, duffelPlaceSupplier } from "@infrastructure/suppliers/duffel";
import { kvCache, noopCache } from "@infrastructure/cache/kv-cache";
import { edgeCache } from "@infrastructure/cache/edge-cache";
import { handleHealth } from "@interfaces/http/health-route";
import { router } from "@interfaces/http/router";
import { readCredential } from "@interfaces/http/credentials";
import { handleScheduled } from "@interfaces/scheduled";
import { consoleLogger } from "@infrastructure/logger";
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
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
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
      bookings: postgresBookingRepository(connectionString),
      tokens: hs256Verifier(config.SECRET_KEY, () => systemClock.now()),
      credential: readCredential(request),
      passwords: bcryptHasher(),
      signer: hs256Signer(config.SECRET_KEY),
      cookiePolicy: {
        domain: config.COOKIE_DOMAIN ?? null,
        secure: config.COOKIE_SECURE,
        lifetimeMinutes: config.ACCESS_TOKEN_EXPIRE_MINUTES,
      },
      mail: resendMailer(
        {
          apiKey: config.RESEND_API_KEY,
          domain: config.MAIL_DOMAIN,
          fromName: config.MAIL_FROM_NAME,
          frontendUrl: config.FRONTEND_URL,
        },
        // Outlives the response without delaying it. A failed send must not
        // undo the change that triggered it, so the rejection stops here.
        (work) => ctx.waitUntil(work.catch(() => {})),
      ),
      frontendUrl: config.FRONTEND_URL,
    };

    const health = await handleHealth(new URL(request.url).pathname, context);
    if (health) return health;

    const { matched, response } = await handler.handle(request, {
      prefix: "/api/v1",
      context,
    });

    return matched ? asFastApiError(response) : proxyToOrigin(request, config.ORIGIN_URL);
  },

  /**
   * Time-triggered work. Nothing happens three hours before a flight - the
   * clock just reaches it - so this has no event to hang off and runs on a
   * schedule instead.
   */
  async scheduled(controller: ScheduledController, env: unknown): Promise<void> {
    const config = readConfig(env);
    const connectionString = config.HYPERDRIVE.connectionString;
    const mail = {
      apiKey: config.RESEND_API_KEY,
      domain: config.MAIL_DOMAIN,
      fromName: config.MAIL_FROM_NAME,
      frontendUrl: config.FRONTEND_URL,
    };

    await handleScheduled(controller.cron, {
      reminders: postgresDepartureReminderRepository(connectionString),
      notifications: postgresNotificationRepository(connectionString),
      mail: resendHtmlMailer(mail),
      logger: consoleLogger(),
      frontendUrl: config.FRONTEND_URL,
      backendUrl: config.BACKEND_PUBLIC_URL,
    });
  },
} satisfies ExportedHandler;
