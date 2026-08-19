import { FlightPathLoading } from "@/components/ui/flight-path-loading";

/** Shown while the offer is re-priced with the airline. Not the shared
 *  skeleton: see components/ui/flight-path-loading.tsx for why this wait
 *  gets its own figure. */
export default function Loading() {
  return <FlightPathLoading />;
}
