"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminUsersQuery } from "@/app/(app)/admin/_lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/** Step 1 of an admin-created booking: pick which existing customer this
 * is for. "Search flights" hands off to the real /search page with
 * ?bookForUserId=<id> riding along (see results-explorer.tsx and
 * search-bar.tsx, which both carry it through to /booking/[offerId]),
 * rather than a separate admin-only search UI - reuses the exact same
 * search/offer-selection flow a customer would go through. */
export function AdminBookingUserPicker() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);

  const { data, isPending, isError } = useInfiniteQuery(adminUsersQuery(search));
  const users = data?.pages.flatMap((page) => page.data);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Book a flight for a customer</h1>
        <p className="text-sm text-muted-foreground">
          Pick who this booking is for, then search flights as usual. This records the booking as
          paid without collecting real payment through flyt - use it for bookings already paid
          for outside the app (cash, bank transfer, invoice).
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim() || undefined);
        }}
        className="flex gap-2"
      >
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by email"
          className="h-9"
        />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load users.</Card>
      )}
      {users && users.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">No users found.</Card>
      )}

      <div className="space-y-2">
        {users
          ?.filter((user) => !user.deleted_at && !user.banned_at)
          .map((user) => (
            <Card key={user.id} className="flex-row items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium">{user.email}</p>
                {user.is_staff && <Badge variant="outline">STAFF</Badge>}
              </div>
              <Button
                size="sm"
                onClick={() =>
                  router.push(`/search?bookForUserId=${user.id}`)
                }
              >
                Search flights
              </Button>
            </Card>
          ))}
      </div>
    </div>
  );
}
