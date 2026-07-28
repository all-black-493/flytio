"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Download, PlaneTakeoff, Ticket as TicketIcon } from "lucide-react";

import { bookingDetailQuery } from "@/app/(app)/account/bookings/[bookingId]/_lib/queries";
import { CancelBookingDialog } from "@/app/(app)/account/bookings/[bookingId]/_components/cancel-booking-dialog";
import { ChangeFlightDialog } from "@/app/(app)/account/bookings/[bookingId]/_components/change-flight-dialog";
import { AirlineLogo } from "@/components/AirlineLogo";
import { FlightItineraryTimeline, segmentFromFlight } from "@/components/FlightItineraryTimeline";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL } from "@/lib/api/client";
import { formatMoney, formatShortDate, formatTime } from "@/lib/api/format";
import type { BookingSlicePublic } from "@/lib/api/schemas";

function SliceCard({ slice }: { slice: BookingSlicePublic }) {
  const first = slice.flights[0];
  const last = slice.flights[slice.flights.length - 1];
  if (!first || !last) return null;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-4 bg-board px-4 py-3 text-board-ink">
        <AirlineLogo
          logoUrl={first.marketing_carrier_logo_url}
          iataCode={first.marketing_carrier_iata_code}
          name={first.marketing_carrier_name}
          fallbackClassName="bg-board-ink/10 text-board-ink"
        />
        <div>
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(first.departing_at)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-board-muted">
            {slice.origin_iata_code} · {formatShortDate(first.departing_at)}
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center px-2">
          <div className="flex w-full items-center gap-1">
            <span className="h-px flex-1 bg-board-muted/40" />
            <PlaneTakeoff className="size-3.5 rotate-45 text-signal" />
            <span className="h-px flex-1 bg-board-muted/40" />
          </div>
          {slice.flights.length > 1 && (
            <span className="mt-1 font-mono text-[10px] text-board-muted">
              {slice.flights.length - 1} stop{slice.flights.length - 1 > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(last.arriving_at)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-board-muted">
            {slice.destination_iata_code} · {formatShortDate(last.arriving_at)}
          </p>
        </div>
      </div>
      <div className="px-4">
        <FlightItineraryTimeline segments={slice.flights.map(segmentFromFlight)} />
      </div>
    </div>
  );
}

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
                  <p className="font-semibold">
                    {formatMoney(booking.total_amount, booking.total_currency)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <a
            href={`${API_URL}/booking/flight-orders/by-id/${booking.id}/itinerary.pdf`}
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            <Download />
            Download itinerary (PDF)
          </a>

          {booking.status === "confirmed" && (
            <>
              <ChangeFlightDialog booking={booking} />
              <CancelBookingDialog booking={booking} />
            </>
          )}

          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              FLIGHTS
            </p>
            {booking.slices.map((slice) => (
              <SliceCard key={slice.id} slice={slice} />
            ))}
          </div>

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
