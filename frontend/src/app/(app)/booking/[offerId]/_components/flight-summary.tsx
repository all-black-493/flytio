import { AirlineLogo } from "@/components/AirlineLogo";
import { FlightItineraryTimeline, segmentFromOffer } from "@/components/FlightItineraryTimeline";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { formatDuration, stopsLabel } from "@/lib/api/format";
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
        {offer.slices.map((slice) => (
          <div key={slice.id} className="p-4">
            <p className="mb-1 font-mono text-[11px] tracking-wide text-muted-foreground">
              {slice.origin.iata_code} → {slice.destination.iata_code} ·{" "}
              {formatDuration(slice.duration)} · {stopsLabel(slice)}
            </p>
            <FlightItineraryTimeline segments={slice.segments.map(segmentFromOffer)} />
          </div>
        ))}
      </div>
    </div>
  );
}
