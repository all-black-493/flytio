import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { adminDashboardSummaryQuery, adminPopularRoutesQuery } from "./_lib/queries";
import { DashboardSummaryCards } from "./_components/dashboard-summary-cards";
import { PopularRoutesPanel } from "./_components/popular-routes-panel";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Admin dashboard — flyt" };

export default async function AdminDashboardPage() {
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(adminDashboardSummaryQuery()),
    queryClient.prefetchQuery(adminPopularRoutesQuery()),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="space-y-8">
        <DashboardSummaryCards />
        <PopularRoutesPanel />
      </div>
    </HydrationBoundary>
  );
}
