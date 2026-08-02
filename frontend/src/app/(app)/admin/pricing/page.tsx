import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { adminDiscountCodesQuery, adminPricingSalesQuery } from "@/app/(app)/admin/_lib/queries";
import { DiscountCodesList } from "@/app/(app)/admin/pricing/_components/discount-codes-list";
import { PricingSalesList } from "@/app/(app)/admin/pricing/_components/pricing-sales-list";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Pricing — flyt admin" };

export default async function AdminPricingPage() {
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(adminPricingSalesQuery()),
    queryClient.prefetchQuery(adminDiscountCodesQuery()),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="space-y-10">
        <PricingSalesList />
        <DiscountCodesList />
      </div>
    </HydrationBoundary>
  );
}
