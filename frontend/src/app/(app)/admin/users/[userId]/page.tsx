import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { adminUserBookingsQuery, adminUserDetailQuery } from "@/app/(app)/admin/_lib/queries";
import { AdminUserDetail } from "@/app/(app)/admin/users/[userId]/_components/admin-user-detail";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "User details — flyt admin" };

interface PageProps {
  params: Promise<{ userId: string }>;
}

/** No auth/staff check here - admin/layout.tsx already gates the whole
 * (app)/admin subtree before this ever renders. */
export default async function AdminUserDetailPage({ params }: PageProps) {
  const { userId } = await params;
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(meQuery()),
    queryClient.prefetchQuery(adminUserDetailQuery(userId)),
    queryClient.prefetchInfiniteQuery(adminUserBookingsQuery(userId)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminUserDetail userId={userId} />
    </HydrationBoundary>
  );
}
