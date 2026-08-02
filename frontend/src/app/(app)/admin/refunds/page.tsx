import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { adminRefundsQuery } from "@/app/(app)/admin/_lib/queries";
import { RefundsList } from "@/app/(app)/admin/refunds/_components/refunds-list";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Refunds — flyt admin" };

export default async function AdminRefundsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(adminRefundsQuery("all"));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RefundsList />
    </HydrationBoundary>
  );
}
