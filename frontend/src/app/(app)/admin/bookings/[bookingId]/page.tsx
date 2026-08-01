import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { adminBookingDetailQuery } from "@/app/(app)/admin/_lib/queries";
import { AdminBookingDetail } from "@/app/(app)/admin/bookings/[bookingId]/_components/admin-booking-detail";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Booking details — flyt admin" };

interface PageProps {
  params: Promise<{ bookingId: string }>;
}

/** No auth/staff check here - admin/layout.tsx already gates the whole
 * (app)/admin subtree before this ever renders. */
export default async function AdminBookingDetailPage({ params }: PageProps) {
  const { bookingId } = await params;
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(adminBookingDetailQuery(bookingId));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminBookingDetail bookingId={bookingId} />
    </HydrationBoundary>
  );
}
