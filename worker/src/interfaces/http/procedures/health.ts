import { implement } from "@orpc/server";
import { checkReadiness } from "@application/use-cases/check-readiness";
import { healthContract } from "@interfaces/http/contract/health";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(healthContract).$context<RequestContext>();

/**
 * Thin on purpose. A procedure validates, takes its dependencies off the
 * context and calls a use case. Any logic that appears here is logic that
 * cannot be tested without oRPC, which is the thing this layout exists to
 * prevent.
 */
export const health = {
  ready: os.ready.handler(({ context }) =>
    checkReadiness({ clock: context.clock, checks: context.healthChecks }),
  ),
};
