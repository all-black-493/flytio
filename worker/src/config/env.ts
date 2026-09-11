import { z } from "zod";

/** Validated once at the edge; layers below receive values, not `env`. */
const schema = z.object({
  ORIGIN_URL: z.url(),
  HYPERDRIVE: z.object({ connectionString: z.string().min(1) }),
  DUFFEL_API_TOKEN: z.string().min(1),
  // The same key the Python service signs with, so sessions issued by either
  // are honoured by both while both are serving.
  SECRET_KEY: z.string().min(1),
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
