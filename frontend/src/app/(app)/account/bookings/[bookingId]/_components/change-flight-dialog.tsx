"use client";

import { useMutation } from "@tanstack/react-query";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createOrderChange, createOrderChangeRequest, listOrderChangeOffers } from "@/lib/api/client";
import { formatMoney } from "@/lib/api/format";
import type {
  BookingPublic,
  BookingSlicePublic,
  OrderChange,
  OrderChangeOffer,
} from "@/lib/api/schemas";
import { compactLabelClass as labelClass } from "@/lib/utils";

type Stage = "form" | "offers" | "pending";

export function ChangeFlightDialog({ booking }: { booking: BookingPublic }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [sliceId, setSliceId] = useState(booking.slices[0]?.id ?? "");
  const [newDate, setNewDate] = useState("");
  const [pendingChange, setPendingChange] = useState<OrderChange | null>(null);

  function reset() {
    setStage("form");
    setNewDate("");
    setPendingChange(null);
  }

  const requestMutation = useMutation({
    mutationFn: (slice: BookingSlicePublic) =>
      createOrderChangeRequest(booking.duffel_order_id, {
        remove: [{ slice_id: slice.duffel_slice_id }],
        add: [
          {
            origin: slice.origin_iata_code,
            destination: slice.destination_iata_code,
            departure_date: newDate,
          },
        ],
      }),
    onSuccess: (response) => {
      offersMutation.mutate(response.data.id);
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Couldn't look up flight changes"));
    },
  });

  const offersMutation = useMutation({
    mutationFn: (changeRequestId: string) =>
      listOrderChangeOffers(booking.duffel_order_id, changeRequestId),
    onSuccess: () => setStage("offers"),
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Couldn't find any flights for that date"));
    },
  });

  const changeMutation = useMutation({
    mutationFn: (offer: OrderChangeOffer) =>
      createOrderChange(booking.duffel_order_id, { selected_order_change_offer: offer.id }),
    onSuccess: (response) => {
      setPendingChange(response.data);
      setStage("pending");
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error, "Couldn't hold that flight change"));
    },
  });

  const selectedSlice = booking.slices.find((s) => s.id === sliceId);
  const offers = offersMutation.data?.data.offers ?? [];

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="w-full font-semibold"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Change flight
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change your flight</DialogTitle>
            <DialogDescription>
              {stage === "form" &&
                "Pick which flight to change and a new date - we'll show you priced options before anything is charged."}
              {stage === "offers" && "Choose a new flight. Nothing is charged yet."}
              {stage === "pending" &&
                "This change is on hold. Contact our support team to complete payment and confirm it."}
            </DialogDescription>
          </DialogHeader>

          {stage === "form" && (
            <div className="space-y-4">
              {booking.slices.length > 1 && (
                <Field>
                  <FieldLabel className={labelClass}>WHICH FLIGHT</FieldLabel>
                  <Select value={sliceId} onValueChange={(v) => v && setSliceId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {booking.slices.map((slice) => (
                        <SelectItem key={slice.id} value={slice.id}>
                          {slice.origin_iata_code} → {slice.destination_iata_code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field>
                <FieldLabel className={labelClass}>NEW DEPARTURE DATE</FieldLabel>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </Field>
            </div>
          )}

          {stage === "offers" && (
            <div className="space-y-2">
              {offers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No available flights found for that date.
                </p>
              )}
              {offers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => changeMutation.mutate(offer)}
                  disabled={changeMutation.isPending}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:border-signal disabled:opacity-50"
                >
                  <span>
                    New total{" "}
                    {offer.new_total_amount &&
                      formatMoney(offer.new_total_amount, offer.new_total_currency ?? booking.total_currency)}
                  </span>
                  <span className="font-semibold">
                    {offer.change_total_amount
                      ? `+${formatMoney(offer.change_total_amount, offer.change_total_currency ?? booking.total_currency)}`
                      : "No extra cost"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {stage === "pending" && pendingChange && (
            <div className="space-y-3 text-sm">
              <p>
                Additional cost:{" "}
                <strong>
                  {pendingChange.change_total_amount
                    ? formatMoney(
                        pendingChange.change_total_amount,
                        pendingChange.change_total_currency ?? booking.total_currency,
                      )
                    : "None"}
                </strong>
              </p>
              <a
                href={`mailto:support@flyt.africa?subject=${encodeURIComponent(
                  `Complete flight change for booking ${booking.booking_reference}`,
                )}`}
                className="text-signal underline"
              >
                Email support to finish this change
              </a>
            </div>
          )}

          <DialogFooter>
            {stage === "form" && (
              <Button
                disabled={!selectedSlice || !newDate || requestMutation.isPending || offersMutation.isPending}
                onClick={() => selectedSlice && requestMutation.mutate(selectedSlice)}
              >
                {requestMutation.isPending || offersMutation.isPending
                  ? "Searching…"
                  : "Find new flights"}
              </Button>
            )}
            {stage === "offers" && (
              <Button variant="outline" onClick={() => setStage("form")}>
                Back
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
