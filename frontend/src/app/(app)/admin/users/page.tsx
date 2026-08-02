import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { adminUsersQuery } from "@/app/(app)/admin/_lib/queries";
import { AdminUsersList } from "@/app/(app)/admin/users/_components/admin-users-list";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Users — flyt admin" };

export default async function AdminUsersPage() {
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(meQuery()),
    queryClient.prefetchInfiniteQuery(adminUsersQuery()),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminUsersList />
    </HydrationBoundary>
  );
}
