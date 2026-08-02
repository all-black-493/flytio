"use client";

import { useQuery } from "@tanstack/react-query";

import { bookingRefundQuery } from "@/app/(app)/account/_lib/queries";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/api/format";

/** The traveller's own view of the refund owed on a cancelled booking.
 *
 * Only two states reach here - the backend collapses its internal
 * failed/manual_required into "processing" (see
 * backend/schemas/refunds.py), because a customer can act on neither and
 * is still owed the money either way. */
export function RefundStatus({ bookingId }: { bookingId: string }) {
  const { data: refund } = useQuery(bookingRefundQuery(bookingId));

  // No refund recorded: the booking wasn't cancelled, or the fare was
  // non-refundable and nothing is owed. Nothing useful to say.
  if (!refund) return null;

  const paid = refund.status === "paid";

  return (
    <Card className="space-y-1 p-4">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        REFUND
      </p>
      <p className="text-lg font-semibold">
        {formatMoney(refund.amount, refund.currency)}
      </p>
      <p className="text-sm text-muted-foreground">
        {paid
          ? "Sent back to you. If you can't see it yet, check with your bank or mobile money provider."
          : "We're processing this. Refunds usually take a few working days to reach you."}
      </p>
    </Card>
  );
}
