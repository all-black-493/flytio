import { AirlineLogo } from "@/components/AirlineLogo";
import { FlightItineraryTimeline, segmentFromOffer } from "@/components/FlightItineraryTimeline";
import { PriceBreakdown } from "@/components/PriceBreakdown";
import { SelfTransferNotice } from "@/components/SelfTransferNotice";
import { formatDuration, formatMoney, stopsLabel } from "@/lib/api/format";
import type { Offer } from "@/lib/api/schemas";

/** Pre-purchase refund/change eligibility, straight from the offer Duffel
 * quoted us - shown before checkout so travelers see it while they can
 * still pick a different fare, not after they've already paid. */
function ConditionsNotice({ offer }: { offer: Offer }) {
  const refund = offer.conditions?.refund_before_departure;
  const change = offer.conditions?.change_before_departure;
  if (!refund && !change) return null;

  return (
    <div className="space-y-1.5 p-4 text-sm">
      <p className="font-mono text-[11px] tracking-widest text-muted-foreground">FARE RULES</p>
      {refund && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Refund before departure</span>
          <span>
            {refund.allowed ? "Allowed" : "Not allowed"}
            {refund.allowed && refund.penalty_amount && (
              <span className="text-muted-foreground">
                {" "}
                ({formatMoney(refund.penalty_amount, refund.penalty_currency!)} fee)
              </span>
            )}
          </span>
        </div>
      )}
      {change && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Change before departure</span>
          <span>
            {change.allowed ? "Allowed" : "Not allowed"}
            {change.allowed && change.penalty_amount && (
              <span className="text-muted-foreground">
                {" "}
                ({formatMoney(change.penalty_amount, change.penalty_currency!)} fee)
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

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
        {offer.partial && (
          <div className="p-4">
            <SelfTransferNotice />
          </div>
        )}
        <ConditionsNotice offer={offer} />
      </div>
    </div>
  );
}
