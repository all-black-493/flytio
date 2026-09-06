import { checkReadiness } from "@application/use-cases/check-readiness";
import { healthResponse } from "@interfaces/http/schemas";
import type { RequestContext } from "@interfaces/http/context";

/**
 * Served outside oRPC deliberately. /health/ready answers 503 with the same
 * body shape as its 200, and oRPC caps a successful response at 200-399 -
 * expressing this as a typed error would wrap the body in oRPC's error
 * envelope and break anything already parsing it.
 */
export async function handleHealth(
  path: string,
  context: RequestContext,
): Promise<Response | null> {
  if (path.endsWith("/health/live")) {
    return Response.json({ status: "alive" });
  }

  if (!path.endsWith("/health/ready") && !path.endsWith("/health")) {
    return null;
  }

  const report = await checkReadiness({ clock: context.clock, checks: context.healthChecks });

  // Parsed on the way out: a drift between the use case and the published
  // shape should fail here rather than in a caller.
  const body = healthResponse.parse(report);

  const readiness = path.endsWith("/health/ready");
  return Response.json(body, {
    status: readiness && body.status !== "healthy" ? 503 : 200,
  });
}
