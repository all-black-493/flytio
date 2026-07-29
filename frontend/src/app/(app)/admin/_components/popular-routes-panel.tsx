"use client";

import { useQuery } from "@tanstack/react-query";

import { adminPopularRoutesQuery } from "@/app/(app)/admin/_lib/queries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PopularRoutesPanel() {
  const { data, isPending, isError } = useQuery(adminPopularRoutesQuery());

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        POPULAR ROUTES
      </p>

      {isPending && <Skeleton className="h-32 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load popular routes.</Card>
      )}
      {data && data.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          No route has enough bookings yet to show a real trend.
        </Card>
      )}

      {data && data.length > 0 && (
        <Card className="divide-y p-0">
          {data.map((route) => (
            <div
              key={`${route.origin_iata_code}-${route.destination_iata_code}`}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="font-medium">
                {route.origin_city_name ?? route.origin_iata_code} ({route.origin_iata_code}) →{" "}
                {route.destination_city_name ?? route.destination_iata_code} (
                {route.destination_iata_code})
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {route.booking_count} booking{route.booking_count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
