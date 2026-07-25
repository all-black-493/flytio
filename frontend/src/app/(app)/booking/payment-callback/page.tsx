import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { PaymentCallback } from "@/app/(app)/booking/payment-callback/_components/payment-callback";
import { paymentStatusQuery } from "@/app/(app)/booking/payment-callback/_lib/queries";
import { isAuthenticated } from "@/lib/auth/session";
import { getQueryClient } from "@/lib/query/get-query-client";

export const metadata = { title: "Confirming your payment - flyt.io" };

interface PageProps {
  searchParams: Promise<{ payment_id?: string; cancelled?: string }>;
}

export default async function PaymentCallbackPage({ searchParams }: PageProps) {
  const { payment_id: paymentId, cancelled } = await searchParams;
  const isCancelled = cancelled === "1";

  if (!(await isAuthenticated())) {
    const next = paymentId
      ? `/booking/payment-callback?payment_id=${paymentId}${isCancelled ? "&cancelled=1" : ""}`
      : "/booking/payment-callback";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const queryClient = getQueryClient();
  if (paymentId && !isCancelled) {
    await queryClient.prefetchQuery(paymentStatusQuery(paymentId));
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PaymentCallback paymentId={paymentId} cancelled={isCancelled} />
      </HydrationBoundary>
    </div>
  );
}
