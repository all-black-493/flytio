"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { adminBookingsQuery } from "@/app/(app)/admin/_lib/queries";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatShortDate } from "@/lib/api/format";

export function AdminBookingsList() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(adminBookingsQuery(search));

  const bookings = data?.pages.flatMap((page) => page.data);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim() || undefined);
          }}
          className="flex flex-1 gap-2"
        >
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by booking reference or email"
            className="h-9"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
        <Link href="/admin/bookings/new" className={buttonVariants({ size: "sm" })}>
          + Book for a customer
        </Link>
      </div>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load bookings.</Card>
      )}
      {bookings && bookings.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">No bookings found.</Card>
      )}

      <div className="space-y-2">
        {bookings?.map((booking) => {
          const slice = booking.slices[0];
          return (
            <Link key={booking.id} href={`/admin/bookings/${booking.id}`}>
              <Card className="gap-2 p-4 transition-colors hover:bg-muted/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                <p className="text-sm text-muted-foreground">{booking.user_email}</p>
                {slice && (
                  <div className="flex items-center justify-between text-sm">
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
      </div>

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
