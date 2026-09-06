import { oc } from "@orpc/contract";
import { z } from "zod";

const dependency = z.object({ status: z.enum(["healthy", "unhealthy"]) });

/**
 * Contract-first: the shape is declared here, implemented separately. It is
 * also the OpenAPI source, so the published spec cannot drift from what the
 * handler actually accepts.
 */
export const healthContract = {
  ready: oc
    .route({ method: "GET", path: "/health/ready" })
    .output(
      z.object({
        status: z.enum(["healthy", "unhealthy"]),
        checkedAt: z.iso.datetime(),
        services: z.record(z.string(), dependency),
      }),
    ),
};
