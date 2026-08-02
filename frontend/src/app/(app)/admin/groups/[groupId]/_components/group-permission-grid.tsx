"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { adminGroupsQuery, adminPermissionsQuery } from "@/app/(app)/admin/_lib/queries";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { assignGroupPermissions, revokeGroupPermission } from "@/lib/api/client";

const ACTIONS = ["view", "add", "change", "delete"] as const;

/** Renders backend/utils/rbac.py's fixed {add,change,delete,view} x
 * {booking,payment,ticket,user} permission grid as an actual grid
 * (actions as columns, models as rows) rather than a flat checklist -
 * mirrors Django's own group-permission editor, fitting since this RBAC
 * system was explicitly modeled on it (see backend/models/rbac.py). */
export function GroupPermissionGrid({ groupId }: { groupId: number }) {
  const queryClient = useQueryClient();
  const { data: groups, isPending: groupsPending, isError: groupsError } = useQuery(
    adminGroupsQuery(),
  );
  const { data: permissions, isPending: permissionsPending } = useQuery(adminPermissionsQuery());
  const group = groups?.find((g) => g.id === groupId);

  const mutation = useMutation({
    mutationFn: ({ codename, granted }: { codename: string; granted: boolean }) =>
      granted
        ? assignGroupPermissions(groupId, [codename])
        : revokeGroupPermission(groupId, codename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminGroupsQuery().queryKey });
    },
  });

  const contentTypes = [...new Set(permissions?.map((p) => p.content_type))].sort();

  return (
    <div className="w-full max-w-2xl space-y-4">
      <Link
        href="/admin/groups"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        BACK TO GROUPS
      </Link>

      {(groupsPending || permissionsPending) && <Skeleton className="h-48 w-full rounded-xl" />}
      {groupsError && (
        <Card className="p-4 text-sm text-destructive">Couldn&apos;t load this group.</Card>
      )}
      {!groupsPending && !group && (
        <Card className="p-4 text-sm text-destructive">Group not found.</Card>
      )}

      {group && permissions && (
        <>
          <h1 className="text-lg font-semibold">{group.name}</h1>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-mono text-[11px] tracking-widest text-muted-foreground">
                    MODEL
                  </th>
                  {ACTIONS.map((action) => (
                    <th
                      key={action}
                      className="p-3 text-center font-mono text-[11px] tracking-widest text-muted-foreground"
                    >
                      {action.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contentTypes.map((contentType) => (
                  <tr key={contentType} className="border-b last:border-0">
                    <td className="p-3 font-medium capitalize">{contentType}</td>
                    {ACTIONS.map((action) => {
                      const codename = `${action}_${contentType}`;
                      const exists = permissions.some((p) => p.codename === codename);
                      if (!exists) return <td key={action} className="p-3 text-center">—</td>;
                      return (
                        <td key={action} className="p-3 text-center">
                          <Checkbox
                            checked={group.permissions.includes(codename)}
                            disabled={mutation.isPending}
                            onCheckedChange={(checked) =>
                              mutation.mutate({ codename, granted: checked === true })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
