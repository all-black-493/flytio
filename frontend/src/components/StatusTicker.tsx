"use client";

import { useQuery } from "@tanstack/react-query";

import { checkHealth } from "@/lib/api/client";

/** Real backend health check, not decorative copy: pings GET /health
 * (per-service DB/Redis/Kafka checks, see backend/routers/health.py)
 * and times it, so the copy and dot color both reflect the actual live
 * backend, not just "did the request succeed." isError (network
 * failure, non-2xx) and a 200 response reporting status: "down" are
 * both treated as fully offline - the distinction is only ever
 * meaningful server-side (which dependency actually failed). */
export function StatusTicker({ className }: { className?: string }) {
  const { data, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const start = performance.now();
      const health = await checkHealth();
      return { ...health, latencyMs: Math.round(performance.now() - start) };
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const offline = isError || data?.status === "down";
  const degraded = data?.status === "degraded";

  return (
    <div className={className}>
      {offline ? (
        <span className="font-mono text-[11px] tracking-[0.15em] text-destructive">
          sys: offline
        </span>
      ) : (
        <span
          className={
            degraded
              ? "font-mono text-[11px] tracking-[0.15em] text-amber-600 dark:text-amber-400"
              : "font-mono text-[11px] tracking-[0.15em] text-board-muted"
          }
        >
          <span
            className={`mr-1.5 inline-block size-1.5 align-middle ${degraded ? "bg-amber-500" : "bg-signal"}`}
          />
          sys: {degraded ? "degraded" : "online"} · fares: live
          {data ? ` · ${data.latencyMs}ms` : ""}
        </span>
      )}
    </div>
  );
}
