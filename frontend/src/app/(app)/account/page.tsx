import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { bookingsQuery, meQuery } from "@/app/(app)/account/_lib/queries";
import { BookingsList } from "@/components/account/bookings-list";
import { ProfileCard } from "@/components/account/profile-card";
import { getQueryClient } from "@/lib/query/get-query-client";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Your account — flyt.io" };

export default async function AccountPage() {
  if (!(await isAuthenticated())) redirect("/login?next=/account");

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(meQuery()),
    queryClient.prefetchInfiniteQuery(bookingsQuery()),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProfileCard />
        <BookingsList />
      </HydrationBoundary>
    </div>
  );
}
