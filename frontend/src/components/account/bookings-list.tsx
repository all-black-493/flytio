"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";

import { bookingsQuery } from "@/app/(app)/account/_lib/queries";
import { AirlineLogo } from "@/components/AirlineLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatShortDate } from "@/lib/api/format";

export function BookingsList() {
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(bookingsQuery());

  const bookings = data?.pages.flatMap((page) => page.data);

  return (
    <div className="mt-6 w-full max-w-sm space-y-3">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        YOUR BOOKINGS
      </p>

      {isPending && <Skeleton className="h-20 w-full rounded-xl" />}
      {isError && <p className="text-sm text-destructive">Couldn&apos;t load your bookings.</p>}

      {bookings && bookings.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          No bookings yet — search for a flight to get started.
        </Card>
      )}

      {bookings?.map((booking) => {
        const slice = booking.slices[0];
        return (
          <Link key={booking.id} href={`/account/bookings/${booking.id}`}>
            <Card className="gap-2 p-4 transition-colors hover:bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                  {booking.booking_reference}
                </span>
                <span
                  className={`font-mono text-[10px] tracking-widest ${
                    booking.status === "cancelled" ? "text-destructive" : "text-signal"
                  }`}
                >
                  {booking.status.toUpperCase()}
                </span>
              </div>
              {slice && (
                <div className="flex items-center gap-2 text-sm">
                  <AirlineLogo
                    logoUrl={slice.flights[0]?.marketing_carrier_logo_url}
                    iataCode={slice.flights[0]?.marketing_carrier_iata_code}
                    name={slice.flights[0]?.marketing_carrier_name}
                    className="size-5 text-[9px]"
                  />
                  <PlaneTakeoff className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {slice.origin_iata_code} → {slice.destination_iata_code}
                  </span>
                  {slice.flights[0] && (
                    <span className="text-muted-foreground">
                      {formatShortDate(slice.flights[0].departing_at)}
                    </span>
                  )}
                </div>
              )}
              <p className="text-sm font-semibold">
                {formatMoney(booking.total_amount, booking.total_currency)}
              </p>
            </Card>
          </Link>
        );
      })}

      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading more…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
