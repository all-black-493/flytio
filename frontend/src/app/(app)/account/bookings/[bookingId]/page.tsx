import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { bookingDetailQuery } from "@/app/(app)/account/bookings/[bookingId]/_lib/queries";
import { BookingDetail } from "@/app/(app)/account/bookings/[bookingId]/_components/booking-detail";
import { getQueryClient } from "@/lib/query/get-query-client";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Booking details — flyt.io" };

interface PageProps {
  params: Promise<{ bookingId: string }>;
}

export default async function BookingDetailPage({ params }: PageProps) {
  if (!(await isAuthenticated())) redirect("/login?next=/account");

  const { bookingId } = await params;
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(bookingDetailQuery(bookingId));

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <BookingDetail bookingId={bookingId} />
      </HydrationBoundary>
    </div>
  );
}
