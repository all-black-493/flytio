import type { Cache as CachePort } from "@application/ports";

/**
 * The Cache API rather than KV for anything short-lived: KV allows 1,000
 * writes a day on the free plan, and a 60-second search cache would spend
 * that before lunch. Per-colo and best-effort, which is the right trade for
 * a result that expires in a minute anyway.
 */
const CACHE_ORIGIN = "https://cache.flyt.invalid/";

function keyRequest(key: string): Request {
  return new Request(new URL(encodeURIComponent(key), CACHE_ORIGIN));
}

export function edgeCache(store: Cache): CachePort {
  return {
    async get<T>(key: string): Promise<T | null> {
      const hit = await store.match(keyRequest(key)).catch(() => undefined);
      return hit ? ((await hit.json()) as T) : null;
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      const stored = new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${ttlSeconds}`,
        },
      });
      // A cache write must not fail the request it was meant to speed up.
      await store.put(keyRequest(key), stored).catch(() => {});
    },
  };
}
