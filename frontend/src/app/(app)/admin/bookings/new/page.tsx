import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { adminUsersQuery } from "@/app/(app)/admin/_lib/queries";
import { AdminBookingUserPicker } from "@/app/(app)/admin/bookings/new/_components/admin-booking-user-picker";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Book for a customer — flyt admin" };

/** No auth/staff check here - admin/layout.tsx already gates the whole
 * (app)/admin subtree before this ever renders. */
export default async function AdminNewBookingPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchInfiniteQuery(adminUsersQuery());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminBookingUserPicker />
    </HydrationBoundary>
  );
}
