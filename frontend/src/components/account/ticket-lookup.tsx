"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBookingByTicketNumber } from "@/lib/api/client";

/** Finds one of the current user's bookings from an airline-issued ticket
 * number alone (GET /booking/flight-orders/by-ticket/{ticketNumber}) - for
 * a traveler who has their ticket number handy but not the booking page. */
export function TicketLookup() {
  const router = useRouter();
  const [ticketNumber, setTicketNumber] = useState("");

  const mutation = useMutation({
    mutationFn: (value: string) => getBookingByTicketNumber(value),
    onSuccess: (booking) => {
      router.push(`/account/bookings/${booking.id}`);
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ticketNumber.trim()) mutation.mutate(ticketNumber.trim());
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 w-full max-w-sm space-y-2">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        FIND A BOOKING BY TICKET NUMBER
      </p>
      <div className="flex gap-2">
        <Input
          value={ticketNumber}
          onChange={(e) => setTicketNumber(e.target.value)}
          placeholder="e.g. 176-1234567890"
          className="font-mono"
        />
        <Button type="submit" variant="outline" size="icon" disabled={mutation.isPending}>
          <Search className="size-4" />
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-destructive">
          No booking found for that ticket number.
        </p>
      )}
    </form>
  );
}
