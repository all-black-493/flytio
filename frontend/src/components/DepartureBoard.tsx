"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { AirlineLogo } from "@/components/AirlineLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { departureBoardQuery } from "@/lib/api/queries";
import { formatDuration, formatMoney, formatTime, stopsLabel } from "@/lib/api/format";
import type { Offer } from "@/lib/api/schemas";

function OfferDetail({ offer }: { offer: Offer }) {
  const slice = offer.slices[0];
  const facts: [string, string][] = [
    ["BASE FARE", offer.base_amount ? formatMoney(offer.base_amount, offer.total_currency) : "—"],
    ["TAXES & FEES", offer.tax_amount ? formatMoney(offer.tax_amount, offer.total_currency) : "—"],
    ["TOTAL", formatMoney(offer.total_amount, offer.total_currency)],
    ["AIRLINE", offer.owner?.name ?? "—"],
  ];
  return (
    <div className="grid gap-6 border-t border-board-line px-4 py-5 sm:px-6 lg:grid-cols-[1.5fr_1fr]">
      <ol className="space-y-4">
        {slice.segments.map((seg) => (
          <li key={seg.id} className="font-mono text-sm leading-relaxed">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-board-ink">
                {formatTime(seg.departing_at)} {seg.origin.iata_code}
              </span>
              <span className="text-signal">→</span>
              <span className="text-board-ink">
                {formatTime(seg.arriving_at)} {seg.destination.iata_code}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-board-muted">
              <AirlineLogo
                logoUrl={seg.marketing_carrier?.logo_symbol_url}
                iataCode={seg.marketing_carrier?.iata_code}
                name={seg.marketing_carrier?.name}
                className="size-4"
                fallbackClassName="bg-board-ink/10 text-[8px] text-board-ink"
              />
              {seg.marketing_carrier?.iata_code} {seg.marketing_carrier_flight_number} ·{" "}
              {seg.marketing_carrier?.name} · {seg.aircraft?.name} ·{" "}
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

function BoardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-board ring-1 ring-board-line">
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-board-line/40" />
        ))}
      </div>
    </div>
  );
}

export default function DepartureBoard() {
  const { data, isPending, isError } = useQuery(departureBoardQuery());

  if (isPending) return <BoardSkeleton />;
  // A non-critical marketing teaser shouldn't show a scary error panel —
  // just quietly omit the section if the live search fails.
  if (isError) return null;

  const offers = data.groups.map((group) => group.primary);
  if (offers.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-board ring-1 ring-board-line shadow-[0_16px_50px_rgba(4,10,20,0.35)]">
      {/* board masthead */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <h2 className="font-mono text-xs tracking-[0.3em] text-board-ink">
          DEPARTURES — OSL → JFK
        </h2>
        <p className="font-mono text-[10px] tracking-[0.2em] text-board-muted">
          LIVE FARES
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
        {offers.slice(0, 5).map((offer, i) => {
          const slice = offer.slices[0];
          const first = slice.segments[0];
          const last = slice.segments[slice.segments.length - 1];
          const fareLabel = formatMoney(offer.total_amount, offer.total_currency);
          return (
            <li
              key={offer.id}
              className="board-row border-t border-board-line"
              style={{ "--row": i } as React.CSSProperties}
            >
              <details className="board-details group">
                <summary className="px-4 py-4 sm:px-6 hover:bg-board-ink/3 transition-colors">
                  {/* md+: board columns */}
                  <div className="hidden md:grid grid-cols-[70px_110px_100px_1fr_90px_110px_100px_28px] gap-3 items-baseline font-mono text-sm">
                    <span className="text-signal">{formatTime(first.departing_at)}</span>
                    <span className="text-board-ink">
                      {first.origin.iata_code}–{last.destination.iata_code}
                    </span>
                    <span className="text-board-ink">
                      {first.marketing_carrier?.iata_code} {first.marketing_carrier_flight_number}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-board-muted">
                      <AirlineLogo
                        logoUrl={first.marketing_carrier?.logo_symbol_url}
                        iataCode={first.marketing_carrier?.iata_code}
                        name={first.marketing_carrier?.name}
                        className="size-4"
                        fallbackClassName="bg-board-ink/10 text-[8px] text-board-ink"
                      />
                      <span className="truncate">{first.marketing_carrier?.name}</span>
                    </span>
                    <span className="text-board-muted">{formatDuration(slice.duration)}</span>
                    <span className="text-board-muted">{stopsLabel(slice)}</span>
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
                        <span className="text-signal">{formatTime(first.departing_at)}</span>{" "}
                        {first.origin.iata_code}–{last.destination.iata_code}
                      </span>
                      <span className="text-lg font-medium text-board-ink">{fareLabel}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-board-muted">
                      <span>
                        {first.marketing_carrier?.iata_code} {first.marketing_carrier_flight_number} ·{" "}
                        {formatDuration(slice.duration)} · {stopsLabel(slice)}
                      </span>
                      <span className="flip-caret">▾</span>
                    </div>
                  </div>
                </summary>
                <OfferDetail offer={offer} />
              </details>

              {/* Outside the <details>, deliberately. A link inside a
                  <summary> is a nested interactive element: clicking it
                  toggles the row open instead of navigating, and screen
                  readers announce the summary and the link as one control.
                  Here it is always visible, so a fare can be acted on
                  without expanding it first. */}
              <div className="flex justify-end border-t border-board-line/60 px-4 py-3 sm:px-6">
                <Link
                  href={`/booking/${offer.id}`}
                  className="bg-signal px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-black transition-colors hover:bg-board-ink hover:text-board active:translate-y-px"
                >
                  Book →
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {/* Once, here - not repeated under every row. Five copies of the
          same reassurance stops being reassuring and becomes noise. */}
      <div className="border-t border-board-line px-4 py-3 sm:px-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-board-muted">
          FARES REFRESH EVERY 60 SECONDS · PRICES CONFIRMED BEFORE PAYMENT
        </p>
      </div>
    </div>
  );
}
