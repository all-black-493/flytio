import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { BookingFlow } from "@/app/(app)/booking/[offerId]/_components/booking-flow";
import { offerPriceQuery, seatMapQuery } from "@/app/(app)/booking/[offerId]/_lib/queries";
import { getQueryClient } from "@/lib/query/get-query-client";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Confirm your booking — flyt" };

interface PageProps {
  params: Promise<{ offerId: string }>;
}

export default async function BookingPage({ params }: PageProps) {
  const { offerId } = await params;

  if (!(await isAuthenticated())) redirect(`/login?next=/booking/${offerId}`);

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(offerPriceQuery(offerId)),
    queryClient.prefetchQuery(seatMapQuery(offerId)),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <BookingFlow offerId={offerId} />
      </HydrationBoundary>
    </div>
  );
}
