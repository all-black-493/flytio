import { checkReadiness } from "@application/use-cases/check-readiness";
import { healthResponse } from "@interfaces/http/schemas";
import type { RequestContext } from "@interfaces/http/context";

/**
 * Outside oRPC: /health/ready answers 503 with the same body as its 200, and
 * oRPC caps success at 200-399. A typed error would wrap the body.
 */
export async function handleHealth(
  path: string,
  // Only what it uses, not the whole context - so adding a dependency for
  // some other route does not ripple through these tests.
  context: Pick<RequestContext, "clock" | "healthChecks">,
): Promise<Response | null> {
  if (path.endsWith("/health/live")) {
    return Response.json({ status: "alive" });
  }

  if (!path.endsWith("/health/ready") && !path.endsWith("/health")) {
    return null;
  }

  const report = await checkReadiness({ clock: context.clock, checks: context.healthChecks });

  // Drift between the use case and the published shape fails here, not in a caller.
  const body = healthResponse.parse(report);

  return Response.json(body, {
    status: path.endsWith("/health/ready") && body.status !== "healthy" ? 503 : 200,
  });
}
