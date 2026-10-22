import type { Cache } from "@application/ports";

/**
 * KV allows 1,000 writes a day on the free plan, so this is for reference
 * data with a long TTL - never per-request state.
 */
export function kvCache(namespace: KVNamespace): Cache {
  return {
    async get<T>(key: string): Promise<T | null> {
      return namespace.get<T>(key, "json");
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      // A cache write must not fail the request it was meant to speed up.
      await namespace
        .put(key, JSON.stringify(value), { expirationTtl: ttlSeconds })
        .catch(() => {});
    },
  };
}

/** For tests and for running without a KV binding. */
export function noopCache(): Cache {
  return {
    async get() {
      return null;
    },
    async set() {},
  };
}
