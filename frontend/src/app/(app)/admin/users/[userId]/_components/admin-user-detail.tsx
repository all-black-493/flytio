"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import {
  adminUserBookingsQuery,
  adminUserDetailQuery,
} from "@/app/(app)/admin/_lib/queries";
import { BanUserDialog } from "@/app/(app)/admin/users/[userId]/_components/ban-user-dialog";
import { UnbanUserButton } from "@/app/(app)/admin/users/[userId]/_components/unban-user-button";
import { UserGroupsPanel } from "@/app/(app)/admin/users/[userId]/_components/user-groups-panel";
import { DeactivateUserDialog } from "@/app/(app)/admin/users/_components/deactivate-user-dialog";
import { ToggleStaffButton } from "@/app/(app)/admin/users/_components/toggle-staff-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatShortDate } from "@/lib/api/format";

export function AdminUserDetail({ userId }: { userId: string }) {
  const { data: me } = useQuery(meQuery());
  const { data: user, isPending, isError } = useQuery(adminUserDetailQuery(userId));
  const {
    data: bookingsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(adminUserBookingsQuery(userId));
  const bookings = bookingsData?.pages.flatMap((page) => page.data);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        BACK TO USERS
      </Link>

      {isPending && <Skeleton className="h-32 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load this user.</Card>
      )}

      {user && (
        <>
          <Card className="gap-3 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-semibold">{user.email}</span>
              <div className="flex items-center gap-1.5">
                {user.is_superuser && <Badge variant="outline">SUPERUSER</Badge>}
                {user.is_staff && <Badge variant="outline">STAFF</Badge>}
                {user.deleted_at && <Badge variant="destructive">DEACTIVATED</Badge>}
                {user.banned_at && <Badge variant="destructive">BANNED</Badge>}
              </div>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Joined {formatShortDate(user.created_at)}
            </p>

            {user.banned_at && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <p>
                  Banned {formatShortDate(user.banned_at)}
                  {user.banned_by_email && ` by ${user.banned_by_email}`}
                </p>
                {user.banned_reason && (
                  <p className="mt-1 text-muted-foreground">&ldquo;{user.banned_reason}&rdquo;</p>
                )}
              </div>
            )}

            {!user.deleted_at && (
              <div className="flex flex-wrap gap-2 pt-1">
                {me?.is_superuser && (
                  <ToggleStaffButton
                    userId={user.id}
                    email={user.email}
                    isStaff={user.is_staff}
                  />
                )}
                {user.banned_at ? (
                  <UnbanUserButton userId={user.id} email={user.email} />
                ) : (
                  <BanUserDialog userId={user.id} email={user.email} />
                )}
                <DeactivateUserDialog userId={user.id} email={user.email} />
              </div>
            )}
          </Card>

          {me?.is_superuser && <UserGroupsPanel userId={user.id} groupIds={user.group_ids} />}

          <div className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              BOOKINGS
            </p>
            {bookings && bookings.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">No bookings yet.</Card>
            )}
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
        </>
      )}
    </div>
  );
}
