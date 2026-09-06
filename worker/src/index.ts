import { Container, getRandom } from "@cloudflare/containers";

// Kept in step with wrangler.jsonc's max_instances.
const INSTANCES = 3;

interface Env {
  BACKEND: DurableObjectNamespace<BackendContainer>;
  DOPPLER_TOKEN?: string;
}

export class BackendContainer extends Container<Env> {
  defaultPort = 8000;
  requiredPorts = [8000];

  // Long enough that a quiet afternoon does not make every visitor pay the
  // 2-3s cold start, short enough to still bill nothing overnight.
  sleepAfter = "15m";

  // Duffel, Pesapal, Neon, Resend and OpenAI are all outbound.
  enableInternet = true;

  // Readiness, not liveness: /health/live answers 200 from a process whose
  // database is unreachable.
  pingEndpoint = "/health/ready";

  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env);

    this.envVars = {
      // Redis is inside this image; the entrypoint starts it.
      REDIS_EMBEDDED: "true",
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: "6379",
      // Everything else still arrives through Doppler, as it does on EC2.
      ...(env.DOPPLER_TOKEN ? { DOPPLER_TOKEN: env.DOPPLER_TOKEN } : {}),
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Stateless API, so any instance will do. Containers do not autoscale;
    // this is the load balancing.
    const container = await getRandom(env.BACKEND, INSTANCES);
    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
