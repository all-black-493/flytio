/**
 * Query definition for the payment-callback page, shared between the
 * server prefetch in page.tsx and the client useQuery call in
 * _components/payment-callback.tsx — see booking/[offerId]/_lib/queries.ts
 * for why queryOptions() is used this way.
 */

import { queryOptions } from "@tanstack/react-query";

import { getPaymentStatus } from "@/lib/api/client";

/** Polls every 2s while the payment is still `pending` (finalize_payment
 * hasn't resolved it yet on the backend — either Pesapal itself hasn't
 * settled, or the IPN/this poll hasn't run finalize_payment yet), and
 * stops automatically once the status is terminal. */
export function paymentStatusQuery(paymentId: string) {
  return queryOptions({
    queryKey: ["payment-status", paymentId] as const,
    queryFn: () => getPaymentStatus(paymentId),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 2000 : false),
  });
}
