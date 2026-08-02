"use client";

import { useQuery } from "@tanstack/react-query";

import { adminDashboardSummaryQuery } from "@/app/(app)/admin/_lib/queries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/api/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="font-mono text-[11px] tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

export function DashboardSummaryCards() {
  const { data, isPending, isError } = useQuery(adminDashboardSummaryQuery());

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <Card className="p-4 text-sm text-destructive">Couldn&apos;t load dashboard stats.</Card>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="TOTAL BOOKINGS" value={String(data.total_bookings)} />
        <StatCard label="BOOKINGS TODAY" value={String(data.bookings_today)} />
        <StatCard label="BOOKINGS THIS WEEK" value={String(data.bookings_this_week)} />
        <StatCard label="TOTAL USERS" value={String(data.total_users)} />
        <StatCard label="ACTIVE USERS" value={String(data.active_users)} />
      </div>

      <Card className="gap-2 p-4">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">REVENUE</p>
        {data.revenue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed payments yet.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {data.revenue.map((row) => (
              <p key={row.currency} className="text-xl font-bold tabular-nums">
                {formatMoney(row.total_amount, row.currency)}
              </p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
