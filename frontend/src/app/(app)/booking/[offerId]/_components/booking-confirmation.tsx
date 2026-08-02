import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BookingPublic } from "@/lib/api/schemas";

export function BookingConfirmation({ booking }: { booking: BookingPublic }) {
  // Only worth a SEATS block if someone actually has one: a traveller who
  // skipped the step (or flew a route with no seat map) shouldn't land on
  // a section that says nothing. Once any passenger has a seat the rest
  // are listed too, so nobody is left wondering whether theirs is missing
  // or simply wasn't shown - hence "Assigned at check-in" rather than a
  // blank, matching the wording the itinerary PDF already uses.
  const seated = booking.passengers.some((p) => p.seat_designator) ? booking.passengers : [];

  return (
    <Card className="w-full max-w-md gap-0 overflow-hidden py-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-6 py-3">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          BOOKING CONFIRMED
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">FLYT</span>
      </div>
      <CardContent className="flex flex-col items-center p-6 text-center">
        <CheckCircle2 className="size-10 text-signal" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">You&apos;re booked</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A confirmation has been sent to your email.
        </p>

        <div className="mt-5 w-full space-y-3 border-t border-dashed pt-4 text-left">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
              BOOKING REFERENCE
            </p>
            <p className="text-lg font-bold tabular-nums">{booking.booking_reference}</p>
          </div>
          {seated.length > 0 && (
            <div>
              <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
                {seated.length > 1 ? "SEATS" : "SEAT"}
              </p>
              {seated.map((passenger) => (
                <p key={passenger.id} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">
                    {passenger.given_name} {passenger.family_name}
                  </span>
                  <span
                    className={
                      passenger.seat_designator
                        ? "font-mono font-bold tabular-nums"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {passenger.seat_designator ?? "Assigned at check-in"}
                  </span>
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground">AIRLINE</p>
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
        </div>

        <Button
          render={<Link href="/account" />}
          nativeButton={false}
          size="lg"
          className="mt-6 w-full font-semibold"
        >
          View your bookings
        </Button>
      </CardContent>
    </Card>
  );
}
