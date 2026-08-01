"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminDiscountCodesQuery } from "@/app/(app)/admin/_lib/queries";
import { CreateDiscountCodeDialog } from "@/app/(app)/admin/pricing/_components/create-discount-code-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { setAdminDiscountCodeActive } from "@/lib/api/client";
import type { DiscountCodeRead } from "@/lib/api/schemas";

function ToggleActiveButton({ discount }: { discount: DiscountCodeRead }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => setAdminDiscountCodeActive(discount.id, !discount.is_active),
    onSuccess: () => {
      toast.success(`"${discount.code}" is ${discount.is_active ? "now off" : "now on"}.`);
      queryClient.invalidateQueries({ queryKey: adminDiscountCodesQuery().queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't update this code.");
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {discount.is_active ? "Turn off" : "Turn on"}
    </Button>
  );
}

/** Discount-code management - customer-typed-at-checkout alternative to
 * a sale, redeemable an admin-set number of times before expiring. See
 * backend/crud/pricing.py's redeem_discount_code - times_redeemed only
 * increments once a booking actually completes, so an abandoned
 * checkout never burns a redemption. */
export function DiscountCodesList() {
  const { data: codes, isPending, isError } = useQuery(adminDiscountCodesQuery());
  const sorted = codes
    ? [...codes].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    : undefined;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Discount codes</h2>
          <p className="text-sm text-muted-foreground">
            Customers enter a code at checkout - never charges flyt below the raw fare.
          </p>
        </div>
        <CreateDiscountCodeDialog />
      </div>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">
          Couldn&apos;t load discount codes - you may not have permission to view pricing.
        </Card>
      )}
      {sorted && sorted.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">No discount codes yet.</Card>
      )}

      <div className="space-y-2">
        {sorted?.map((discount) => {
          const expired = discount.expires_at ? new Date(discount.expires_at) < new Date() : false;
          const exhausted =
            discount.max_redemptions !== null &&
            discount.times_redeemed >= discount.max_redemptions;
          return (
            <Card key={discount.id} className="gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium tracking-wide">{discount.code}</span>
                  <Badge variant={discount.is_active ? "default" : "secondary"}>
                    {discount.is_active ? "active" : "off"}
                  </Badge>
                  {expired && <Badge variant="outline">expired</Badge>}
                  {exhausted && <Badge variant="outline">exhausted</Badge>}
                </div>
                <ToggleActiveButton discount={discount} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                {discount.discount_percentage}% off · {discount.times_redeemed} used
                {discount.max_redemptions !== null ? ` / ${discount.max_redemptions}` : ""}
                {discount.expires_at
                  ? ` · expires ${new Date(discount.expires_at).toLocaleString()}`
                  : " · no expiry"}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
