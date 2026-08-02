"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmCancellation, requestCancellation } from "@/lib/api/client";
import { formatMoney } from "@/lib/api/format";
import type { BookingPublic } from "@/lib/api/schemas";

export function CancelBookingDialog({ booking }: { booking: BookingPublic }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const quoteMutation = useMutation({
    mutationFn: () => requestCancellation(booking.duffel_order_id),
  });

  const confirmMutation = useMutation({
    mutationFn: (cancellationId: string) =>
      confirmCancellation(booking.duffel_order_id, cancellationId),
    onSuccess: () => {
      toast.success("Booking cancelled");
      queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      setOpen(false);
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Couldn't cancel this booking"));
    },
  });

  const quote = quoteMutation.data?.data;
  // Deliberately NOT quote.refund_amount: that is what returns to flyt's
  // Duffel balance, and it can exceed what this customer actually paid
  // once a discount code is involved. The backend computes the real
  // figure with the same code that pays it out (backend/crud/refunds.py),
  // so what's promised here and what arrives can't drift apart.
  const customerRefund = quoteMutation.data?.customer_refund;

  return (
    <>
      <Button
        variant="destructive"
        size="lg"
        className="w-full font-semibold"
        onClick={() => {
          setOpen(true);
          quoteMutation.mutate();
        }}
      >
        Cancel booking
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {quoteMutation.isPending && "Checking your refund eligibility…"}
              {quoteMutation.isError &&
                friendlyAuthError(
                  quoteMutation.error,
                  "This booking can't be cancelled online.",
                )}
              {customerRefund && Number(customerRefund.amount) > 0 && (
                <>
                  You&apos;ll be refunded{" "}
                  <strong>
                    {formatMoney(customerRefund.amount, customerRefund.currency)}
                  </strong>
                  {customerRefund.to_original_payment_method ? (
                    <> to your original payment method.</>
                  ) : (
                    // Pesapal can't carry this one (most often a partial
                    // refund on M-Pesa, which it only allows in full), so
                    // promising the original payment method would be a
                    // promise flyt can't keep - someone settles it by hand.
                    <>
                      . Our team will arrange this with you directly, as it
                      can&apos;t be sent back automatically.
                    </>
                  )}{" "}
                  Refunds usually take a few working days to arrive. This
                  can&apos;t be undone.
                </>
              )}
              {customerRefund && Number(customerRefund.amount) === 0 && (
                <>
                  This fare is non-refundable, so cancelling won&apos;t return any
                  money. This can&apos;t be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!quote || confirmMutation.isPending}
              onClick={() => quote && confirmMutation.mutate(quote.id)}
            >
              {confirmMutation.isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
