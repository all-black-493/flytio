"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminPricingSalesQuery } from "@/app/(app)/admin/_lib/queries";
import { CreateSaleDialog } from "@/app/(app)/admin/pricing/_components/create-sale-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteAdminPricingSale } from "@/lib/api/client";
import type { PricingSaleRead } from "@/lib/api/schemas";

function saleStatus(sale: PricingSaleRead): "upcoming" | "active" | "ended" {
  const now = Date.now();
  if (now < new Date(sale.starts_at).getTime()) return "upcoming";
  if (now > new Date(sale.ends_at).getTime()) return "ended";
  return "active";
}

function DeleteSaleButton({ sale }: { sale: PricingSaleRead }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteAdminPricingSale(sale.id),
    onSuccess: () => {
      toast.success(`"${sale.name}" removed.`);
      queryClient.invalidateQueries({ queryKey: adminPricingSalesQuery().queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't remove this sale.");
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? "Removing…" : "Remove"}
    </Button>
  );
}

const STATUS_VARIANT = {
  active: "default",
  upcoming: "outline",
  ended: "secondary",
} as const;

/** Sale/markup-override management - flyt's "Black Friday" lever. Only
 * one sale can be active at a time (backend/crud/pricing.py rejects
 * overlapping windows), and it replaces the standard 7% markup for
 * every customer automatically - no code, no opt-in - see
 * backend/utils/pricing.py's get_active_markup_rate. */
export function PricingSalesList() {
  const { data: sales, isPending, isError } = useQuery(adminPricingSalesQuery());
  const sorted = sales
    ? [...sales].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    : undefined;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Sales</h2>
          <p className="text-sm text-muted-foreground">
            A scheduled markup override applies to every customer automatically - no code needed.
          </p>
        </div>
        <CreateSaleDialog />
      </div>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">
          Couldn&apos;t load sales - you may not have permission to view pricing.
        </Card>
      )}
      {sorted && sorted.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          No sales scheduled - the standard markup applies.
        </Card>
      )}

      <div className="space-y-2">
        {sorted?.map((sale) => {
          const status = saleStatus(sale);
          return (
            <Card key={sale.id} className="gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{sale.name}</span>
                  <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                </div>
                <DeleteSaleButton sale={sale} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                {(sale.markup_rate * 100).toFixed(1)}% markup ·{" "}
                {new Date(sale.starts_at).toLocaleString()} –{" "}
                {new Date(sale.ends_at).toLocaleString()}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
