import { PageLoading } from "@/components/ui/page-loading";

/** Streamed in by Next while this segment's server component resolves.
 *  See components/ui/page-loading.tsx for why it is a skeleton. */
export default function Loading() {
  return <PageLoading label="ADMIN" />;
}
