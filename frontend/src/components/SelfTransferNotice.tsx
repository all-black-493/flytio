import { TriangleAlert } from "lucide-react";

/** Offer.partial - a self-transfer itinerary Duffel stitched together
 * from separate airlines' offers: no through check-in/baggage, and a
 * missed connection isn't the airline's responsibility. Shown wherever
 * an offer is displayed (search results, booking flow) so the traveler
 * knows before they book, not after a missed connection. */
export function SelfTransferNotice({ className }: { className?: string }) {
  return (
    <p
      className={`flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400 ${className ?? ""}`}
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      Self-transfer: separate tickets on different airlines. No protected
      connection - baggage and check-in aren&apos;t through, and a missed
      connection is not the airline&apos;s responsibility.
    </p>
  );
}
