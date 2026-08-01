"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { adminGroupsQuery } from "@/app/(app)/admin/_lib/queries";
import { CreateGroupDialog } from "@/app/(app)/admin/groups/_components/create-group-dialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminGroupsList() {
  const { data: groups, isPending, isError } = useQuery(adminGroupsQuery());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Groups grant a bundle of permissions to every member at once.
        </p>
        <CreateGroupDialog />
      </div>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {isError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load groups.</Card>
      )}
      {groups && groups.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          No groups yet - create one to get started.
        </Card>
      )}

      <div className="space-y-2">
        {groups?.map((group) => (
          <Link key={group.id} href={`/admin/groups/${group.id}`}>
            <Card className="gap-1 p-4 transition-colors hover:bg-muted/50">
              <span className="font-medium">{group.name}</span>
              <p className="font-mono text-[11px] text-muted-foreground">
                {group.permissions.length} permission{group.permissions.length === 1 ? "" : "s"}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
