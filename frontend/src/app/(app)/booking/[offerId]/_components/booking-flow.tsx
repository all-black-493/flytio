"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { adminUserDetailQuery } from "@/app/(app)/admin/_lib/queries";
import { BaggagePicker } from "@/app/(app)/booking/[offerId]/_components/baggage-picker";
import { DiscountCodeField } from "@/app/(app)/booking/[offerId]/_components/discount-code-field";
import { FlightSummary } from "@/app/(app)/booking/[offerId]/_components/flight-summary";
import { PassengerForm, type PassengerDetails } from "@/app/(app)/booking/[offerId]/_components/passenger-form";
import { SeatPicker, type SeatPick } from "@/app/(app)/booking/[offerId]/_components/seat-picker";
import { offerPriceQuery, seatMapQuery } from "@/app/(app)/booking/[offerId]/_lib/queries";
import { DuffelCardPayment } from "@/components/DuffelCardPayment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  checkout,
  checkoutWithCard,
  confirmCardPayment,
  createAdminBooking,
  updateOfferPassengerLoyalty,
} from "@/lib/api/client";
import type { DiscountPreviewResponse, Offer } from "@/lib/api/schemas";
import type { LoyaltyProgrammeAccount, OrderPassenger } from "@/lib/api/types";

type Step = "seats" | "passengers" | "payment";
type PaymentMethod = "pesapal" | "card";

export function BookingFlow({ offerId }: { offerId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me } = useQuery(meQuery());
  // Only trusted when the viewer is actually staff - a non-staff visitor
  // who somehow lands on this URL with the param present must still get
  // the normal customer checkout flow. This is a UX convenience only;
  // the real enforcement is the backend's require_permission("add_booking")
  // on POST /api/admin/bookings, same posture as every other admin action
  // in this app.
  const bookForUserId = me?.is_staff ? searchParams.get("bookForUserId") : null;
  const { data: bookForUser } = useQuery({
    ...adminUserDetailQuery(bookForUserId ?? ""),
    enabled: !!bookForUserId,
  });
  const priceQuery = useQuery(offerPriceQuery(offerId));
  const seatQuery = useQuery(seatMapQuery(offerId));

  const [step, setStep] = useState<Step>("seats");
  const [selectedSeats, setSelectedSeats] = useState<Record<string, SeatPick>>({});
  const [selectedBaggage, setSelectedBaggage] = useState<Record<string, Set<string>>>({});
  const [activePassengerId, setActivePassengerId] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<OrderPassenger[] | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [cardClientToken, setCardClientToken] = useState<string | null>(null);
  const [cardPaymentId, setCardPaymentId] = useState<string | null>(null);
  // Set once a passenger's frequent-flyer number has been attached to the
  // offer and it's been re-priced - Duffel only reflects a loyalty
  // discount after re-fetching, so this may differ from priceQuery's
  // original offer.
  const [repricedOffer, setRepricedOffer] = useState<Offer | null>(null);
  const [isApplyingLoyalty, setIsApplyingLoyalty] = useState(false);
  // Not offered for admin-created bookings - those never collect real
  // payment in the first place (see backend/schemas/payments.py's
  // CheckoutRequest.discount_code docstring).
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    preview: DiscountPreviewResponse;
  } | null>(null);

  const offer = repricedOffer ?? priceQuery.data?.data;
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

  const checkoutMutation = useMutation({
    mutationFn: checkout,
    onSuccess: (data) => {
      // A real cross-origin navigation to Pesapal's hosted checkout, not a
      // Next.js client-side route.
      window.location.href = data.redirect_url;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Checkout failed. Please try again.");
    },
  });

  const checkoutCardMutation = useMutation({
    mutationFn: checkoutWithCard,
    onSuccess: (data) => {
      setCardPaymentId(data.payment_id);
      setCardClientToken(data.client_token);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Checkout failed. Please try again.");
    },
  });

  const adminBookingMutation = useMutation({
    mutationFn: createAdminBooking,
    onSuccess: (booking) => {
      toast.success(`Booked ${booking.booking_reference} for ${booking.user_email}.`);
      router.push(`/admin/bookings/${booking.id}`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't create this booking. Please try again.",
      );
    },
  });

  const confirmCardMutation = useMutation({
    mutationFn: confirmCardPayment,
    onSuccess: () => {
      // confirm-card already ran the booking-completion step synchronously
      // (no webhook/poll needed, unlike Pesapal) - the callback page's own
      // status query will see "completed" on its very first request and
      // render the same BookingConfirmation Pesapal's flow lands on.
      router.push(`/booking/payment-callback?payment_id=${cardPaymentId}`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't confirm your payment. Please try again.",
      );
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

  async function handlePassengerSubmit(
    passengerDetails: PassengerDetails[],
    loyaltyAccounts: (LoyaltyProgrammeAccount | null)[],
  ) {
    if (!offer) return;
    setPassengers(
      offer.passengers.map((p, index) => ({
        id: p.id,
        ...passengerDetails[index],
        seat_designator: selectedSeats[p.id]?.designator,
        seat_service_id: selectedSeats[p.id]?.serviceId,
        extra_baggage_service_ids: Array.from(selectedBaggage[p.id] ?? []),
      })),
    );

    // Duffel only reflects a loyalty-discounted fare after the offer is
    // re-fetched post-attach - applied sequentially (each PATCH re-fetches
    // the whole offer) so the final total accounts for every passenger's
    // loyalty account, not just the last one applied.
    const loyaltyEntries = offer.passengers
      .map((p, index) => ({ offerPassengerId: p.id, details: passengerDetails[index], loyalty: loyaltyAccounts[index] }))
      .filter((entry) => entry.loyalty !== null);
    if (loyaltyEntries.length > 0) {
      setIsApplyingLoyalty(true);
      try {
        let latestOffer = offer;
        for (const entry of loyaltyEntries) {
          const response = await updateOfferPassengerLoyalty(offer.id, entry.offerPassengerId, {
            given_name: entry.details.given_name,
            family_name: entry.details.family_name,
            loyalty_programme_accounts: [entry.loyalty!],
          });
          latestOffer = response.data;
        }
        setRepricedOffer(latestOffer);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn't apply your frequent flyer number - continuing without it.",
        );
      } finally {
        setIsApplyingLoyalty(false);
      }
    }

    setStep("payment");
  }

  const seatTotal = Object.values(selectedSeats).reduce(
    (sum, seat) => sum + parseFloat(seat.amount),
    0,
  );
  const seatCurrency = Object.values(selectedSeats)[0]?.currency;

  const selectedBaggageServices = offer.available_services.filter((service) =>
    Object.values(selectedBaggage).some((ids) => ids.has(service.id)),
  );
  const baggageTotal = selectedBaggageServices.reduce(
    (sum, service) => sum + parseFloat(service.total_amount),
    0,
  );
  const baggageCurrency = selectedBaggageServices[0]?.total_currency;
  const extrasTotal = seatTotal + baggageTotal;
  const extrasCurrency = seatCurrency ?? baggageCurrency;

  function toggleBaggage(passengerId: string, serviceId: string) {
    setSelectedBaggage((prev) => {
      const next = new Set(prev[passengerId] ?? []);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return { ...prev, [passengerId]: next };
    });
  }

  function payWithPesapal() {
    if (!offer || !passengers) return;
    setPaymentMethod("pesapal");
    checkoutMutation.mutate({
      selected_offers: [offer.id],
      passengers,
      discount_code: appliedDiscount?.code,
    });
  }

  function markAsPaidForAdmin() {
    if (!offer || !passengers || !bookForUserId) return;
    adminBookingMutation.mutate({
      user_id: bookForUserId,
      selected_offers: [offer.id],
      passengers,
    });
  }

  // Not called from anywhere right now - the "Pay by card" tile below is
  // disabled (Duffel Payments doesn't support Kenya yet), but this is
  // left wired up rather than deleted so re-enabling it later is just
  // restoring the tile's onClick, not rebuilding this.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function payWithCard() {
    if (!offer || !passengers) return;
    setPaymentMethod("card");
    checkoutCardMutation.mutate({
      selected_offers: [offer.id],
      passengers,
      discount_code: appliedDiscount?.code,
    });
  }

  return (
    <div className="space-y-6">
      {bookForUserId && (
        <div className="rounded-lg border border-signal/40 bg-signal/5 px-4 py-2 text-sm">
          Booking on behalf of{" "}
          <span className="font-semibold">{bookForUser?.email ?? bookForUserId}</span> - this
          will be recorded as paid without collecting real payment.
        </div>
      )}

      <FlightSummary offer={offer} />

      {step === "seats" && (
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
              onSelect={(passengerId, pick) =>
                setSelectedSeats((prev) => ({ ...prev, [passengerId]: pick }))
              }
            />
          )}
          <BaggagePicker
            services={offer.available_services}
            passengers={seatEligiblePassengers}
            selected={selectedBaggage}
            onToggle={toggleBaggage}
          />
          {extrasTotal > 0 && extrasCurrency && (
            <p className="text-center text-sm text-muted-foreground">
              Seats and extras add {extrasCurrency} {extrasTotal.toFixed(2)} to your total.
            </p>
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
      )}

      {step === "passengers" && (
        <PassengerForm
          passengers={offer.passengers}
          identityDocumentRequired={offer.passenger_identity_documents_required}
          onBack={() => setStep("seats")}
          onSubmit={handlePassengerSubmit}
          isSubmitting={isApplyingLoyalty}
          submitLabel={`Continue to payment · ${offer.total_currency} ${offer.total_amount}`}
        />
      )}

      {step === "payment" && bookForUserId && (
        <Button
          size="lg"
          className="w-full font-semibold"
          disabled={adminBookingMutation.isPending}
          onClick={markAsPaidForAdmin}
        >
          {adminBookingMutation.isPending
            ? "Creating booking…"
            : `Mark as paid & create booking · ${offer.total_currency} ${offer.total_amount}`}
        </Button>
      )}

      {step === "payment" && !bookForUserId && (
        <div className="space-y-4">
          {!paymentMethod && (
            <DiscountCodeField
              offerId={offer.id}
              appliedDiscount={appliedDiscount?.preview ?? null}
              onApply={(code, preview) => setAppliedDiscount({ code, preview })}
              onRemove={() => setAppliedDiscount(null)}
            />
          )}
          {!paymentMethod && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Card
                className="cursor-pointer gap-2 p-5 hover:border-signal"
                onClick={payWithPesapal}
              >
                <p className="font-semibold">M-Pesa / mobile money / card</p>
                <p className="text-sm text-muted-foreground">
                  Pay via Pesapal — redirects to a secure payment page.
                </p>
              </Card>
              {/* Duffel Payments (Duffel's own card-collection product,
                  see DuffelCardPayment/checkoutWithCard/confirmCardPayment
                  below) is disabled, not removed - Duffel confirmed it's
                  only available for customers in Australia, Europe, the
                  UK, and the US today, so it always fails for this app's
                  Kenya-based customers. Left in place in case that
                  changes, or the app later serves customers in a
                  supported region. */}
              <Card
                aria-disabled
                className="cursor-not-allowed gap-2 p-5 opacity-50"
              >
                <p className="font-semibold">Pay by card</p>
                <p className="text-sm text-muted-foreground">
                  Not available in your region yet — use M-Pesa / mobile money / card above.
                </p>
              </Card>
            </div>
          )}

          {paymentMethod === "pesapal" && checkoutMutation.isPending && (
            <p className="text-center text-sm text-muted-foreground">Redirecting to payment…</p>
          )}

          {paymentMethod === "card" && (
            <div className="space-y-4">
              {checkoutCardMutation.isPending && (
                <Skeleton className="h-48 w-full rounded-xl" />
              )}
              {cardClientToken && cardPaymentId && (
                <DuffelCardPayment
                  clientToken={cardClientToken}
                  onSuccessfulPayment={() => confirmCardMutation.mutate(cardPaymentId)}
                  onFailedPayment={(error) =>
                    toast.error(error.message ?? "Card payment failed. Please try again.")
                  }
                />
              )}
              {confirmCardMutation.isPending && (
                <p className="text-center text-sm text-muted-foreground">
                  Confirming your payment…
                </p>
              )}
            </div>
          )}

          {paymentMethod && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={checkoutMutation.isPending || checkoutCardMutation.isPending || confirmCardMutation.isPending}
              onClick={() => {
                setPaymentMethod(null);
                setCardClientToken(null);
                setCardPaymentId(null);
              }}
            >
              Choose a different payment method
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
