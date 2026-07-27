import { PlaneTakeoff } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { formatDuration, formatShortDate, formatTime, stopsLabel } from "@/lib/api/format";
import type { Offer } from "@/lib/api/schemas";

export function FlightSummary({ offer }: { offer: Offer }) {
  const firstSegmentCarrier = offer.slices[0]?.segments[0]?.marketing_carrier;
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 justify-between bg-board px-4 py-2.5 text-board-ink">
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-board-muted">
          <AirlineLogo
            logoUrl={offer.owner?.logo_symbol_url ?? firstSegmentCarrier?.logo_symbol_url}
            iataCode={offer.owner?.iata_code ?? firstSegmentCarrier?.iata_code}
            name={offer.owner?.name ?? firstSegmentCarrier?.name}
            className="size-5"
            fallbackClassName="bg-board-ink/10 text-[9px] text-board-ink"
          />
          {offer.owner?.name ?? "Airline"}
        </span>
        <PriceBreakdown
          baseAmount={offer.base_amount}
          baseCurrency={offer.base_currency}
          taxAmount={offer.tax_amount}
          taxCurrency={offer.tax_currency}
          totalAmount={offer.total_amount}
          totalCurrency={offer.total_currency}
        />
      </div>
      <div className="divide-y">
        {offer.slices.map((slice) => {
          const first = slice.segments[0];
          const last = slice.segments[slice.segments.length - 1];
          return (
            <div key={slice.id} className="flex items-center gap-4 p-4">
              <div>
                <p className="text-lg font-bold tabular-nums leading-none">
                  {formatTime(first.departing_at)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {first.origin.iata_code} · {formatShortDate(first.departing_at)}
                </p>
              </div>
              <div className="flex flex-1 flex-col items-center px-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatDuration(slice.duration)}
                </span>
                <div className="flex w-full items-center gap-1">
                  <span className="h-px flex-1 bg-border" />
                  <PlaneTakeoff className="size-3.5 rotate-45 text-signal" />
                  <span className="h-px flex-1 bg-border" />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {stopsLabel(slice)}
                </span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums leading-none">
                  {formatTime(last.arriving_at)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {last.destination.iata_code} · {formatShortDate(last.arriving_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
