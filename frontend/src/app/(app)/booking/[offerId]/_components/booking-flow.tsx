"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BookingConfirmation } from "@/app/(app)/booking/[offerId]/_components/booking-confirmation";
import { FlightSummary } from "@/app/(app)/booking/[offerId]/_components/flight-summary";
import { PassengerForm, type PassengerDetails } from "@/app/(app)/booking/[offerId]/_components/passenger-form";
import { SeatPicker } from "@/app/(app)/booking/[offerId]/_components/seat-picker";
import { offerPriceQuery, seatMapQuery } from "@/app/(app)/booking/[offerId]/_lib/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createOrder } from "@/lib/api/client";

type Step = "seats" | "passengers";

export function BookingFlow({ offerId }: { offerId: string }) {
  const priceQuery = useQuery(offerPriceQuery(offerId));
  const seatQuery = useQuery(seatMapQuery(offerId));

  const [step, setStep] = useState<Step>("seats");
  const [selectedSeats, setSelectedSeats] = useState<Record<string, string>>({});
  const [activePassengerId, setActivePassengerId] = useState<string | null>(null);

  const offer = priceQuery.data?.data;
  const seatMap = seatQuery.data?.data[0];
  const hasSelectableSeats = useMemo(
    () =>
      seatMap?.cabins.some((cabin) =>
        cabin.rows.some((row) =>
          row.sections.some((section) => section.elements.some((el) => el.type === "seat")),
        ),
      ) ?? false,
    [seatMap],
  );
  // Lap infants (infant_without_seat) never get their own seat, per
  // Duffel's passenger types - they're excluded from seat selection.
  const seatEligiblePassengers = useMemo(
    () => offer?.passengers.filter((p) => p.type !== "infant_without_seat") ?? [],
    [offer],
  );
  const effectiveActivePassengerId = activePassengerId ?? seatEligiblePassengers[0]?.id ?? "";

  const orderMutation = useMutation({
    mutationFn: createOrder,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Booking failed. Please try again.");
    },
  });

  if (priceQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (priceQuery.isError || !offer) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">This offer is no longer available</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Fares expire quickly. Search again to see current prices.
        </p>
      </div>
    );
  }

  if (orderMutation.isSuccess) {
    return <BookingConfirmation order={orderMutation.data.data} />;
  }

  function handleSubmit(passengers: PassengerDetails[]) {
    if (!offer) return;
    orderMutation.mutate({
      selected_offers: [offer.id],
      passengers: offer.passengers.map((p, index) => ({
        id: p.id,
        ...passengers[index],
        seat_designator: selectedSeats[p.id],
      })),
      payments: [
        { type: "balance", currency: offer.total_currency, amount: offer.total_amount },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <FlightSummary offer={offer} />

      {step === "seats" ? (
        <div className="space-y-4">
          {seatQuery.isPending && <Skeleton className="h-64 w-full rounded-xl" />}
          {!seatQuery.isPending && !hasSelectableSeats && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No seat map available for this flight — you can still book, and select a seat at
              check-in.
            </p>
          )}
          {seatMap && hasSelectableSeats && (
            <SeatPicker
              seatMap={seatMap}
              passengers={seatEligiblePassengers}
              activePassengerId={effectiveActivePassengerId}
              onActivePassengerChange={setActivePassengerId}
              selectedSeats={selectedSeats}
              onSelect={(passengerId, designator) =>
                setSelectedSeats((prev) => ({ ...prev, [passengerId]: designator }))
              }
            />
          )}
          <Button
            size="lg"
            className="w-full font-semibold"
            onClick={() => setStep("passengers")}
          >
            {hasSelectableSeats
              ? `Continue · ${Object.keys(selectedSeats).length} of ${seatEligiblePassengers.length} seats selected`
              : "Continue"}
          </Button>
        </div>
      ) : (
        <PassengerForm
          passengers={offer.passengers}
          onBack={() => setStep("seats")}
          onSubmit={handleSubmit}
          isSubmitting={orderMutation.isPending}
          submitLabel={`Confirm booking · ${offer.total_currency} ${offer.total_amount}`}
        />
      )}
    </div>
  );
}
