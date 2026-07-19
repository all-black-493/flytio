import {
  aircraftName,
  carrierName,
  formatDuration,
  formatMoney,
  formatTime,
  offerTotal,
  stopsLabel,
  type Dictionaries,
  type FlightOffer,
} from "@/lib/flights";

function OfferDetail({
  offer,
  dictionaries,
}: {
  offer: FlightOffer;
  dictionaries: Dictionaries;
}) {
  const fare = offer.travelerPricings[0];
  const firstFare = fare.fareDetailsBySegment[0];
  const facts: [string, string][] = [
    ["FARE", firstFare.brandedFare ?? fare.fareOption],
    ["CLASS", firstFare.class],
    ["CHECKED BAGS", String(firstFare.includedCheckedBags?.quantity ?? 0)],
    ["SEATS LEFT", String(offer.numberOfBookableSeats)],
    ["BASE FARE", formatMoney(offer.price.base, offer.price.currency)],
    ["TICKET BY", offer.lastTicketingDate],
  ];
  return (
    <div className="grid gap-6 border-t border-board-line px-4 py-5 sm:px-6 lg:grid-cols-[1.5fr_1fr]">
      <ol className="space-y-4">
        {offer.itineraries[0].segments.map((seg) => (
          <li key={seg.id} className="font-mono text-sm leading-relaxed">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-board-ink">
                {formatTime(seg.departure.at)} {seg.departure.iataCode}
                {seg.departure.terminal && (
                  <span className="text-board-muted"> T{seg.departure.terminal}</span>
                )}
              </span>
              <span className="text-signal">→</span>
              <span className="text-board-ink">
                {formatTime(seg.arrival.at)} {seg.arrival.iataCode}
                {seg.arrival.terminal && (
                  <span className="text-board-muted"> T{seg.arrival.terminal}</span>
                )}
              </span>
            </div>
            <div className="mt-1 text-xs text-board-muted">
              {seg.carrierCode} {seg.number} ·{" "}
              {carrierName(seg.carrierCode, dictionaries)} ·{" "}
              {aircraftName(seg.aircraft.code, dictionaries)} ·{" "}
              {formatDuration(seg.duration)}
            </div>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 self-start font-mono text-xs">
        {facts.map(([term, def]) => (
          <div key={term}>
            <dt className="text-board-muted tracking-widest">{term}</dt>
            <dd className="mt-0.5 text-board-ink">{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function DepartureBoard({
  offers,
  dictionaries,
}: {
  offers: FlightOffer[];
  dictionaries: Dictionaries;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-board ring-1 ring-board-line shadow-[0_16px_50px_rgba(4,10,20,0.35)]">
      {/* board masthead */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <h2 className="font-mono text-xs tracking-[0.3em] text-board-ink">
          DEPARTURES — OSL → JFK
        </h2>
        <p className="font-mono text-[10px] tracking-[0.2em] text-board-muted">
          FRI 14 AUG · LIVE FARES VIA AMADEUS
        </p>
      </div>
      {/* column headers (md+) */}
      <div className="hidden md:grid grid-cols-[70px_110px_100px_1fr_90px_110px_100px_28px] gap-3 border-t border-board-line px-6 py-2 font-mono text-[10px] tracking-[0.2em] text-board-muted">
        <span>TIME</span>
        <span>ROUTE</span>
        <span>FLIGHT</span>
        <span>OPERATOR</span>
        <span>DUR</span>
        <span>STOPS</span>
        <span className="text-right">FARE</span>
        <span />
      </div>
      <ul>
        {offers.map((offer, i) => {
          const itinerary = offer.itineraries[0];
          const first = itinerary.segments[0];
          const last = itinerary.segments[itinerary.segments.length - 1];
          const cabin = offer.travelerPricings[0].fareDetailsBySegment[0].cabin;
          const fareLabel = formatMoney(offerTotal(offer), offer.price.currency);
          return (
            <li
              key={offer.id}
              className="board-row border-t border-board-line"
              style={{ "--row": i } as React.CSSProperties}
            >
              <details className="board-details group">
                <summary className="px-4 py-4 sm:px-6 hover:bg-white/3 transition-colors">
                  {/* md+: board columns */}
                  <div className="hidden md:grid grid-cols-[70px_110px_100px_1fr_90px_110px_100px_28px] gap-3 items-baseline font-mono text-sm">
                    <span className="text-signal">{formatTime(first.departure.at)}</span>
                    <span className="text-board-ink">
                      {first.departure.iataCode}–{last.arrival.iataCode}
                    </span>
                    <span className="text-board-ink">
                      {first.carrierCode} {first.number}
                    </span>
                    <span className="truncate text-board-muted">
                      {carrierName(first.carrierCode, dictionaries)}
                      {cabin !== "ECONOMY" && (
                        <span className="text-signal"> · {cabin}</span>
                      )}
                    </span>
                    <span className="text-board-muted">
                      {formatDuration(itinerary.duration)}
                    </span>
                    <span className="text-board-muted">{stopsLabel(itinerary)}</span>
                    <span className="text-right text-lg font-medium text-board-ink">
                      {fareLabel}
                    </span>
                    <span className="flip-caret text-board-muted text-xs self-center justify-self-end">
                      ▾
                    </span>
                  </div>
                  {/* mobile: stacked ticket row */}
                  <div className="md:hidden font-mono text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-board-ink">
                        <span className="text-signal">{formatTime(first.departure.at)}</span>{" "}
                        {first.departure.iataCode}–{last.arrival.iataCode}
                      </span>
                      <span className="text-lg font-medium text-board-ink">
                        {fareLabel}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-board-muted">
                      <span>
                        {first.carrierCode} {first.number} ·{" "}
                        {formatDuration(itinerary.duration)} · {stopsLabel(itinerary)}
                        {cabin !== "ECONOMY" && (
                          <span className="text-signal"> · {cabin}</span>
                        )}
                      </span>
                      <span className="flip-caret">▾</span>
                    </div>
                  </div>
                </summary>
                <OfferDetail offer={offer} dictionaries={dictionaries} />
              </details>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-board-line px-4 py-3 sm:px-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-board-muted">
          FARES REFRESH EVERY 60 SECONDS · PRICES CONFIRMED BEFORE PAYMENT
        </p>
      </div>
    </div>
  );
}
