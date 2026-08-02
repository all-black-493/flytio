"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { adminRefundsQuery } from "@/app/(app)/admin/_lib/queries";
import {
  REFUND_FILTERS,
  REFUND_STATUS_DISPLAY,
} from "@/app/(app)/admin/refunds/_lib/refund-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { completeAdminRefund, retryAdminRefund } from "@/lib/api/client";
import { formatMoney } from "@/lib/api/format";
import type { RefundRead, RefundStatus } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

/** Both row actions are the same shape - a mutation that returns the
 * updated refund and refreshes the list - so they share one component
 * rather than duplicating the wiring twice. */
function RefundAction({
  refund,
  label,
  pendingLabel,
  successMessage,
  action,
  variant = "outline",
}: {
  refund: RefundRead;
  label: string;
  pendingLabel: string;
  successMessage: string;
  action: (refundId: string) => Promise<RefundRead>;
  variant?: "outline" | "default";
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => action(refund.id),
    onSuccess: () => {
      toast.success(successMessage);
      // Invalidate every filter view, not just the one on screen - the
      // row's status just changed, so it may belong under a different
      // filter now.
      queryClient.invalidateQueries({ queryKey: ["admin", "refunds"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    },
  });

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? pendingLabel : label}
    </Button>
  );
}

function RefundRow({ refund }: { refund: RefundRead }) {
  const display = REFUND_STATUS_DISPLAY[refund.status];

  return (
    <Card className={cn("p-4", display.actionable && "border-destructive/40")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">
              {formatMoney(refund.amount, refund.currency)}
            </span>
            <Badge variant={display.variant}>{display.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{display.help}</p>
          {/* The reason is the actual instruction for a manual payout -
           * it says exactly why Pesapal couldn't carry it. */}
          {refund.failure_reason && (
            <p className="text-xs text-destructive">{refund.failure_reason}</p>
          )}
          <p className="font-mono text-[11px] text-muted-foreground">
            {refund.booking_id ? (
              <Link
                href={`/admin/bookings/${refund.booking_id}`}
                className="text-signal hover:underline"
              >
                View booking
              </Link>
            ) : (
              "No booking linked"
            )}
            <span className="mx-2">·</span>
            {new Date(refund.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {refund.status === "failed" && (
            <RefundAction
              refund={refund}
              label="Retry"
              pendingLabel="Retrying…"
              successMessage="Refund re-sent to Pesapal."
              action={retryAdminRefund}
            />
          )}
          {refund.status !== "completed" && (
            <RefundAction
              refund={refund}
              label="Mark paid"
              pendingLabel="Saving…"
              successMessage="Refund marked as paid."
              action={completeAdminRefund}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

/** Staff view of money owed back to customers. Cancelling a booking
 * refunds flyt's own Duffel balance, never the customer - that leg goes
 * back down Pesapal separately (backend/crud/refunds.py), and the ones
 * Pesapal can't carry surface here for a human to settle. */
export function RefundsList() {
  const [filter, setFilter] = useState<RefundStatus | "all">("all");
  const { data: refunds, isPending, isError } = useQuery(adminRefundsQuery(filter));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Refunds</h2>
        <p className="text-sm text-muted-foreground">
          Money owed back to customers after a cancellation. Pesapal only refunds
          mobile money in full, so partial M-Pesa refunds have to be paid out by
          hand - those show as “needs manual payout”.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REFUND_FILTERS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">
          Couldn&apos;t load refunds - you may not have permission to view payments.
        </Card>
      )}
      {refunds && refunds.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No refunds here.
        </Card>
      )}
      {refunds && refunds.length > 0 && (
        <div className="space-y-3">
          {refunds.map((refund) => (
            <RefundRow key={refund.id} refund={refund} />
          ))}
        </div>
      )}
    </section>
  );
}
