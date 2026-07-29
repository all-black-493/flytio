"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { adminUsersQuery } from "@/app/(app)/admin/_lib/queries";
import { DeactivateUserDialog } from "@/app/(app)/admin/users/_components/deactivate-user-dialog";
import { ToggleStaffButton } from "@/app/(app)/admin/users/_components/toggle-staff-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/api/format";

export function AdminUsersList() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);

  const { data: me } = useQuery(meQuery());
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(adminUsersQuery(search));

  const users = data?.pages.flatMap((page) => page.data);

  return (
    <div className="space-y-4">
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
        {users?.map((user) => (
          <Card key={user.id} className="gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{user.email}</span>
              <div className="flex items-center gap-1.5">
                {user.is_superuser && <Badge variant="outline">SUPERUSER</Badge>}
                {user.is_staff && <Badge variant="outline">STAFF</Badge>}
                {user.deleted_at && <Badge variant="destructive">DEACTIVATED</Badge>}
              </div>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Joined {formatShortDate(user.created_at)}
            </p>
            {!user.deleted_at && (
              <div className="flex flex-wrap gap-2 pt-1">
                {me?.is_superuser && (
                  <ToggleStaffButton userId={user.id} email={user.email} isStaff={user.is_staff} />
                )}
                <DeactivateUserDialog userId={user.id} email={user.email} />
              </div>
            )}
          </Card>
        ))}
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
