import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { adminBookingsQuery } from "@/app/(app)/admin/_lib/queries";
import { AdminBookingsList } from "@/app/(app)/admin/bookings/_components/admin-bookings-list";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Bookings — flyt admin" };

export default async function AdminBookingsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchInfiniteQuery(adminBookingsQuery());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminBookingsList />
    </HydrationBoundary>
  );
}
