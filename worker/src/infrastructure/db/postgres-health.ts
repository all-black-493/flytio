import { Client } from "pg";
import type { HealthCheck, ServiceHealth } from "@application/ports";

/**
 * A new Client per check: Hyperdrive owns the pool, so connecting is cheap
 * and holding one across invocations is not safe in a Worker.
 */
export function postgresHealthCheck(connectionString: string): HealthCheck {
  return {
    async check(): Promise<ServiceHealth> {
      const client = new Client({ connectionString });
      try {
        await client.connect();
        await client.query("SELECT 1");
        return { status: "healthy", detail: null };
      } catch (error) {
        return { status: "unhealthy", detail: error instanceof Error ? error.message : String(error) };
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}
