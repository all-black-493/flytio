"use client";

import { useQuery } from "@tanstack/react-query";

import { checkHealth } from "@/lib/api/client";

/** Real backend health check, not decorative copy: pings GET /health (a
 * DB round trip, see backend/main.py) and times it, so "online" and the
 * latency figure both reflect the actual live backend. */
export function StatusTicker({ className }: { className?: string }) {
  const { data, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const start = performance.now();
      await checkHealth();
      return { latencyMs: Math.round(performance.now() - start) };
    },
    refetchInterval: 30_000,
    retry: false,
  });

  return (
    <div className={className}>
      {isError ? (
        <span className="font-mono text-[11px] tracking-[0.15em] text-destructive">
          sys: offline
        </span>
      ) : (
        <span className="font-mono text-[11px] tracking-[0.15em] text-board-muted">
          <span className="mr-1.5 inline-block size-1.5 bg-signal align-middle" />
          sys: online · fares: live{data ? ` · ${data.latencyMs}ms` : ""}
        </span>
      )}
    </div>
  );
}
