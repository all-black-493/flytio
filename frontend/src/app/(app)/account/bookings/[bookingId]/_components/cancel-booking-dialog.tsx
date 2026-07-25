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
              {quote && (
                <>
                  You&apos;ll be refunded{" "}
                  <strong>
                    {formatMoney(
                      quote.refund_amount ?? "0",
                      quote.refund_currency ?? booking.total_currency,
                    )}
                  </strong>{" "}
                  to your original payment method. This can&apos;t be undone.
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
