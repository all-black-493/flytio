"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminGroupsQuery, adminUserDetailQuery } from "@/app/(app)/admin/_lib/queries";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { assignUserGroups, removeUserGroup } from "@/lib/api/client";

/** Only ever rendered for a superuser viewer (see admin-user-detail.tsx)
 * - matches the backend, where every group-membership route
 * (POST/DELETE .../users/{id}/groups...) requires is_superuser, not just
 * a permission (utils/rbac.py's require_superuser docstring: granting
 * permissions can't itself require a permission). Group *creation* and
 * *editing a group's own permission set* live on /admin/groups instead -
 * this is membership only, for this one user. */
export function UserGroupsPanel({ userId, groupIds }: { userId: string; groupIds: number[] }) {
  const queryClient = useQueryClient();
  const { data: groups, isPending, isError } = useQuery(adminGroupsQuery());

  const mutation = useMutation({
    mutationFn: ({ groupId, member }: { groupId: number; member: boolean }) =>
      member ? assignUserGroups(userId, [groupId]) : removeUserGroup(userId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserDetailQuery(userId).queryKey });
    },
  });

  return (
    <Card className="gap-2 p-4">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">GROUPS</p>
      {isPending && <Skeleton className="h-16 w-full" />}
      {isError && <p className="text-sm text-destructive">Couldn&apos;t load groups.</p>}
      {groups && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No groups exist yet - create one from the Groups tab.
        </p>
      )}
      <div className="space-y-2">
        {groups?.map((group) => (
          <label key={group.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={groupIds.includes(group.id)}
              disabled={mutation.isPending}
              onCheckedChange={(checked) =>
                mutation.mutate({ groupId: group.id, member: checked === true })
              }
            />
            <span>{group.name}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}
