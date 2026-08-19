import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { Card } from "@/components/ui/card";
import { formatDuration, formatMoney, formatTime } from "@/lib/api/format";
import type { ConciergeFlightCard as ConciergeFlightCardData } from "@/lib/api/schemas";

/** Compact card for the chat context - the full search-results card
 * (search/_components/flight-result-card.tsx) is too dense for a chat
 * bubble. Reuses the same formatting utilities rather than duplicating
 * them; booking itself happens on the existing /booking/[offerId] flow,
 * not in the concierge - it only ever hands off to a real, bookable
 * offer. */
export function ConciergeFlightCard({
  offer,
  authed,
}: {
  offer: ConciergeFlightCardData;
  authed: boolean;
}) {
  return (
    <Card className="gap-2 p-3">
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <AirlineLogo logoUrl={offer.airline_logo_url} name={offer.airline_name} className="size-5" />
        {offer.airline_name ?? "Airline"}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(offer.departing_at)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {offer.origin_city_name ?? offer.origin_iata_code}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-signal" />
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(offer.arriving_at)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {offer.destination_city_name ?? offer.destination_iata_code}
          </p>
        </div>
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">
        {offer.duration ? formatDuration(offer.duration) : ""} ·{" "}
        {offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}
      </p>

      <div className="flex items-center justify-between border-t pt-2">
        <span className="text-base font-bold tabular-nums">
          {formatMoney(offer.total_amount, offer.total_currency)}
        </span>
        {/* The concierge answers for anyone; acting on an answer needs an
            account. Signed out, this routes through login and comes back to
            the same offer via ?next - losing the flight you just found is a
            worse experience than the sign-in itself. */}
        <Link
          href={
            authed
              ? `/booking/${offer.offer_id}`
              : `/login?next=${encodeURIComponent(`/booking/${offer.offer_id}`)}`
          }
          className="font-mono text-[11px] tracking-wide text-signal hover:underline"
        >
          {authed ? "View & book →" : "Sign in to book →"}
        </Link>
      </div>
    </Card>
  );
}
