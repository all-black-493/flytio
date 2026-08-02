"use client";

import { useQuery } from "@tanstack/react-query";

import { bookingRefundQuery } from "@/app/(app)/account/_lib/queries";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/api/format";
import type { BookingPublic } from "@/lib/api/schemas";

/** Typical time for a refund to actually land, quoted as "usually"
 * rather than a guarantee: Pesapal refunds wait on their own finance
 * team's approval, and a refund Pesapal can't carry (a partial M-Pesa
 * one) waits on a staff member working the manual queue - neither is
 * something flyt controls tightly enough to promise. */
const TYPICAL_REFUND_DAYS = "3-5 business days";

/** What a traveller is told about their money after cancelling.
 *
 * Renders for every cancelled booking, not just those with a refund on
 * record - a refund row appears only once the cancellation event has
 * been processed, and never at all for a non-refundable fare, so keying
 * purely off the refund would leave those travellers staring at a
 * cancelled booking with no explanation.
 *
 * Only two refund states reach here; the backend collapses its internal
 * failed/manual_required into "processing" (see
 * backend/schemas/refunds.py), because a customer can act on neither and
 * is owed the money either way. */
export function CancellationRefundNotice({ booking }: { booking: BookingPublic }) {
  const cancelled = booking.status === "cancelled";
  const { data: refund } = useQuery({
    ...bookingRefundQuery(booking.id),
    // Nothing to fetch for a live booking - without this the request
    // fires on every booking view just to 404.
    enabled: cancelled,
  });

  if (!cancelled) return null;

  return (
    <Card className="space-y-1 p-4">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        {refund ? "REFUND" : "CANCELLED"}
      </p>

      {refund ? (
        <>
          <p className="text-lg font-semibold">
            {formatMoney(refund.amount, refund.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {refund.status === "paid"
              ? "This refund has been sent back to you. If you can't see it yet, check with your bank or mobile money provider."
              : `We're processing this refund. It usually reaches you within ${TYPICAL_REFUND_DAYS}.`}
          </p>
        </>
      ) : (
        // No refund on record: either the cancellation is still being
        // processed, or the fare was non-refundable and nothing is owed.
        // The two are indistinguishable from here, so this deliberately
        // says "if a refund is due" rather than promising one that may
        // never come.
        <p className="text-sm text-muted-foreground">
          This booking has been cancelled. If a refund is due on your fare,
          we&apos;ll process it automatically - refunds usually reach you within{" "}
          {TYPICAL_REFUND_DAYS}.
        </p>
      )}
    </Card>
  );
}
