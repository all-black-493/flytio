import { z } from "zod";

/**
 * Validated once at the edge. Everything below this file receives values, not
 * `env`, so nothing in domain/ or application/ knows Cloudflare exists.
 */
const schema = z.object({
  ORIGIN_URL: z.url(),
});

export type Config = z.infer<typeof schema>;

export function readConfig(env: unknown): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid worker configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
