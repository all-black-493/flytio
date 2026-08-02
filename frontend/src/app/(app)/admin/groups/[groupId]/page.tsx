import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { adminGroupsQuery, adminPermissionsQuery } from "@/app/(app)/admin/_lib/queries";
import { GroupPermissionGrid } from "@/app/(app)/admin/groups/[groupId]/_components/group-permission-grid";
import { getCurrentUser } from "@/lib/api/client";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Group permissions — flyt admin" };

interface PageProps {
  params: Promise<{ groupId: string }>;
}

/** Superuser-only - see /admin/groups/page.tsx's docstring. */
export default async function AdminGroupDetailPage({ params }: PageProps) {
  let superuser = false;
  try {
    superuser = (await getCurrentUser()).is_superuser;
  } catch {
    superuser = false;
  }
  if (!superuser) redirect("/admin");

  const { groupId } = await params;
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(adminGroupsQuery()),
    queryClient.prefetchQuery(adminPermissionsQuery()),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GroupPermissionGrid groupId={Number(groupId)} />
    </HydrationBoundary>
  );
}
