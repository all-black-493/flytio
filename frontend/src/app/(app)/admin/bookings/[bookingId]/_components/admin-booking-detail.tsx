"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";

import { adminBookingDetailQuery } from "@/app/(app)/admin/_lib/queries";
import { AirlineLogo } from "@/components/AirlineLogo";
import { BaggageSummary, FareRulesCard, SliceCard } from "@/components/booking/BookingDetailParts";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  API_URL,
  backfillBookingTickets,
  resendBookingConfirmation,
} from "@/lib/api/client";

/** Staff view of one booking - same rendering building blocks as the
 * customer's own booking page (components/booking/BookingDetailParts),
 * but view-only aside from two admin actions: manually re-checking
 * Duffel for e-tickets on a booking that's still ticket-less after the
 * automatic booking-time retry window, and resending the confirmation
 * email. Price overrides are a later phase - this page doesn't
 * anticipate their shape, it just needs to exist so that has somewhere
 * to attach to. */
export function AdminBookingDetail({ bookingId }: { bookingId: string }) {
  const { data: booking, isPending, isError } = useQuery(adminBookingDetailQuery(bookingId));
  const queryClient = useQueryClient();

  const backfillMutation = useMutation({
    mutationFn: () => backfillBookingTickets(bookingId),
    onSuccess: (updated) => {
      const ticketCount = updated.passengers.reduce((sum, p) => sum + p.tickets.length, 0);
      toast.success(
        ticketCount > 0
          ? `Found ${ticketCount} ticket(s).`
          : "Duffel still hasn't issued tickets for this order yet.",
      );
      queryClient.invalidateQueries({ queryKey: adminBookingDetailQuery(bookingId).queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't check Duffel for tickets.");
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => resendBookingConfirmation(bookingId),
    onSuccess: (result) => toast.success(result.message),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the confirmation email.");
    },
  });

  const hasAnyTickets = booking?.passengers.some((p) => p.tickets.length > 0) ?? false;

  return (
    <div className="w-full max-w-md">
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        BACK TO BOOKINGS
      </Link>

      {isPending && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {isError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load this booking.</Card>
      )}

      {booking && (
        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden py-0 shadow-xl">
            <div className="flex items-center justify-between bg-board px-6 py-3">
              <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
                {booking.status === "cancelled" ? "CANCELLED" : "BOOKING"}
              </span>
              <span className="font-mono text-[11px] tracking-[0.25em] text-signal">FLYT</span>
            </div>
            <CardContent className="space-y-3 p-6">
              <div>
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                  BOOKING REFERENCE
                </p>
                <p className="text-lg font-bold tabular-nums">{booking.booking_reference}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                  BOOKED BY
                </p>
                <Link
                  href={`/admin/users/${booking.user_id}`}
                  className="text-sm text-signal underline underline-offset-2"
                >
                  {booking.user_email}
                </Link>
              </div>
              <div className="flex justify-between border-t border-dashed pt-3">
                <div>
                  <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                    AIRLINE
                  </p>
                  <p className="flex items-center gap-1.5">
                    <AirlineLogo
                      logoUrl={booking.slices[0]?.flights[0]?.marketing_carrier_logo_url}
                      iataCode={booking.owner_iata_code}
                      name={booking.owner_name}
                      className="size-5 text-[9px]"
                    />
                    {booking.owner_name ?? "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                    TOTAL PAID
                  </p>
                  <PriceBreakdown
                    baseAmount={booking.base_amount}
                    baseCurrency={booking.base_currency}
                    taxAmount={booking.tax_amount}
                    taxCurrency={booking.tax_currency}
                    totalAmount={booking.total_amount}
                    totalCurrency={booking.total_currency}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`${API_URL}/booking/flight-orders/by-id/${booking.id}/itinerary.pdf`}
              className={buttonVariants({ variant: "outline", className: "col-span-2" })}
            >
              <Download />
              Download itinerary (PDF)
            </a>
            <Button
              variant="outline"
              disabled={resendMutation.isPending}
              onClick={() => resendMutation.mutate()}
            >
              {resendMutation.isPending ? "Sending…" : "Resend confirmation email"}
            </Button>
            <Button
              variant="outline"
              disabled={backfillMutation.isPending || hasAnyTickets}
              onClick={() => backfillMutation.mutate()}
            >
              {backfillMutation.isPending
                ? "Checking Duffel…"
                : hasAnyTickets
                  ? "Tickets issued"
                  : "Check Duffel for tickets"}
            </Button>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              FLIGHTS
            </p>
            {booking.slices.map((slice) => (
              <SliceCard key={slice.id} slice={slice} />
            ))}
          </div>

          <FareRulesCard booking={booking} />

          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              PASSENGERS &amp; TICKETS
            </p>
            {booking.passengers.map((passenger) => (
              <Card key={passenger.id} className="gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {passenger.given_name} {passenger.family_name}
                  </span>
                  <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                    SEAT {passenger.seat_designator ?? "TBD"}
                  </span>
                </div>
                <BaggageSummary passenger={passenger} />
                <p className="text-sm text-muted-foreground">
                  {passenger.tickets.length > 0
                    ? passenger.tickets.map((t) => t.ticket_number).join(", ")
                    : "Ticket pending"}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
