import { z } from "zod";

/** Validated once at the edge; layers below receive values, not `env`. */
const schema = z.object({
  ORIGIN_URL: z.url(),
  HYPERDRIVE: z.object({ connectionString: z.string().min(1) }),
  DUFFEL_API_TOKEN: z.string().min(1),
  // The same key the Python service signs with, so sessions issued by either
  // are honoured by both while both are serving.
  SECRET_KEY: z.string().min(1),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().int().positive().default(60),
  // The shared parent domain in production, so the app and the API both see
  // the cookie. Unset locally, where a host-only cookie already spans ports.
  COOKIE_DOMAIN: z.string().min(1).optional(),
  COOKIE_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .default(true),
  // Optional: without it, reference data is fetched every time rather than
  // the endpoint failing.
  PLACES_CACHE: z.custom<KVNamespace>().optional(),
});

export type Config = z.infer<typeof schema>;

export function readConfig(env: unknown): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid worker configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
