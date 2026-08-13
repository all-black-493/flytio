"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Ticket as TicketIcon, TriangleAlert } from "lucide-react";

import { bookingDetailQuery } from "@/app/(app)/account/bookings/[bookingId]/_lib/queries";
import { CancelBookingDialog } from "@/app/(app)/account/bookings/[bookingId]/_components/cancel-booking-dialog";
import { TicketSheet } from "@/components/tickets/TicketSheet";
import { CancellationRefundNotice } from "@/app/(app)/account/bookings/[bookingId]/_components/cancellation-refund-notice";
import { ChangeFlightDialog } from "@/app/(app)/account/bookings/[bookingId]/_components/change-flight-dialog";
import { AirlineLogo } from "@/components/AirlineLogo";
import { BaggageSummary, FareRulesCard, SliceCard } from "@/components/booking/BookingDetailParts";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/api/format";

export function BookingDetail({ bookingId }: { bookingId: string }) {
  const { data: booking, isPending, isError } = useQuery(bookingDetailQuery(bookingId));

  return (
    <div className="w-full max-w-md">
      <Link
        href="/account"
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

          {booking.airline_initiated_change_detected_at && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                The airline changed this booking&apos;s schedule on{" "}
                {formatShortDate(booking.airline_initiated_change_detected_at)}. Review your
                itinerary below, or{" "}
                <Link href="/contact" className="underline underline-offset-2">
                  contact support
                </Link>{" "}
                if it no longer works for you.
              </span>
            </p>
          )}

          {/* Tickets carry their own print/PDF actions, so the standalone
              download button that used to sit here would be a third way
              to do the same thing. */}
          <TicketSheet booking={booking} />

          {booking.status === "confirmed" && (
            <>
              <ChangeFlightDialog booking={booking} />
              <CancelBookingDialog booking={booking} />
            </>
          )}

          {/* Self-gating on booking.status, so it sits here
           * unconditionally rather than duplicating that check. */}
          <CancellationRefundNotice booking={booking} />

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
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TicketIcon className="size-3.5" />
                  {passenger.tickets.length > 0 ? (
                    <span className="tabular-nums">
                      {passenger.tickets.map((t) => t.ticket_number).join(", ")}
                    </span>
                  ) : (
                    <span>Ticket pending</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
