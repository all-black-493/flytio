import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { adminGroupsQuery } from "@/app/(app)/admin/_lib/queries";
import { AdminGroupsList } from "@/app/(app)/admin/groups/_components/admin-groups-list";
import { getCurrentUser } from "@/lib/api/client";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Groups — flyt admin" };

/** Superuser only, same as everywhere else group/permission management
 * appears - the backend 403s a non-superuser hitting these routes, and
 * admin/layout.tsx's own gate is is_staff, not is_superuser (it just
 * hides this page's nav link for non-superusers), so this page needs
 * its own superuser check for anyone who navigates here directly. */
export default async function AdminGroupsPage() {
  let superuser = false;
  try {
    superuser = (await getCurrentUser()).is_superuser;
  } catch {
    superuser = false;
  }
  if (!superuser) redirect("/admin");

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(adminGroupsQuery());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminGroupsList />
    </HydrationBoundary>
  );
}
