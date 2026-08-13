"use client";

import { useState } from "react";
import { ChevronDown, PlaneTakeoff } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FlightItineraryTimeline,
  formatLayoverDuration,
  layoverMinutes,
  segmentFromOffer,
} from "@/components/FlightItineraryTimeline";
import { SelfTransferNotice } from "@/components/SelfTransferNotice";
import { formatDuration, formatMoney, formatTime, stopsLabel } from "@/lib/api/format";
import type { Offer, OfferSlice } from "@/lib/api/schemas";

/** Distinct aircraft types flown on a slice, in order, e.g. "Boeing 777-300ER"
 * or "Boeing 737 · Airbus A320" for a two-leg trip on different equipment.
 * Empty when the airline reports no aircraft, which Duffel leaves nullable. */
function aircraftLabel(slice: OfferSlice): string {
  const names = slice.segments.map((s) => s.aircraft?.name).filter((n): n is string => !!n);
  return [...new Set(names)].join(" · ");
}

function SliceRow({ slice }: { slice: OfferSlice }) {
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  const stops = slice.segments.length - 1;

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-xl font-bold tabular-nums leading-none">{formatTime(first.departing_at)}</p>
        <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
          {first.origin.iata_code}
        </p>
      </div>

      <div className="flex flex-col items-center px-2">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {formatDuration(slice.duration)}
        </span>
        <div className="flex w-full items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-signal/50" />
          <span className="h-px flex-1 bg-border" />
          <PlaneTakeoff className="size-3.5 rotate-45 text-signal" />
          <span className="h-px flex-1 bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-signal/50" />
        </div>
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {stopsLabel(slice)}
        </span>
      </div>

      <div className="text-right">
        <p className="text-xl font-bold tabular-nums leading-none">{formatTime(last.arriving_at)}</p>
        <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
          {last.destination.iata_code}
        </p>
      </div>

      {stops > 0 && (
        <p className="col-span-3 -mt-1 font-mono text-[11px] text-muted-foreground">
          via{" "}
          {slice.segments
            .slice(0, -1)
            .map((s, i) => {
              const next = slice.segments[i + 1];
              const minutes = layoverMinutes(s.arriving_at, next.departing_at);
              return `${s.destination.iata_code} (${formatLayoverDuration(minutes)})`;
            })
            .join(", ")}
        </p>
      )}

      {/* Aircraft per leg - travellers do choose on equipment (a 777 over a
       * regional jet on a long haul), and Duffel already returns it on every
       * segment. Deduplicated so a two-leg hop on the same type reads
       * "Boeing 737" rather than repeating itself. */}
      {aircraftLabel(slice) && (
        <p className="col-span-3 -mt-0.5 font-mono text-[11px] text-muted-foreground/80">
          {aircraftLabel(slice)}
        </p>
      )}
    </div>
  );
}

export interface FlightResultCardProps {
  offer: Offer;
  alternates?: Offer[];
  onViewFares?: (offer: Offer) => void;
  onSelect?: (offer: Offer) => void;
}

export function FlightResultCard({ offer, alternates = [], onViewFares, onSelect }: FlightResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const firstSegmentCarrier = offer.slices[0]?.segments[0]?.marketing_carrier;
  const airline = offer.owner?.name ?? firstSegmentCarrier?.name ?? "Airline";
  const airlineIataCode = offer.owner?.iata_code ?? firstSegmentCarrier?.iata_code;
  const airlineLogoUrl = offer.owner?.logo_symbol_url ?? firstSegmentCarrier?.logo_symbol_url;
  // e.g. "KQ310 · EK722" - the operating detail people check against a
  // booking, deduplicated so a same-flight connection isn't repeated.
  const flightNumbers = [
    ...new Set(
      offer.slices.flatMap((s) =>
        s.segments.map((seg) =>
          `${seg.marketing_carrier?.iata_code ?? ""}${seg.marketing_carrier_flight_number ?? ""}`.trim(),
        ),
      ),
    ),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col sm:flex-row">
        {/* itinerary — clean, scannable, light surface */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          {/* Airline first, and in the body rather than the stub. It used
              to appear only on the dark stub, which stacks BELOW the
              itinerary on a phone - so a reviewer scanning results on
              mobile scrolled past times, route and price before seeing any
              logo, and reported the logos as missing. Carriers are the
              first thing people filter on mentally; this is where the eye
              lands. */}
          <div className="flex items-center gap-2.5 pb-3">
            <AirlineLogo
              logoUrl={airlineLogoUrl}
              iataCode={airlineIataCode}
              name={airline}
              className="size-9 shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{airline}</p>
              {flightNumbers && (
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {flightNumbers}
                </p>
              )}
            </div>
          </div>

          <div className="divide-y divide-dashed border-t border-dashed">
            {offer.slices.map((slice) => (
              <SliceRow key={slice.id} slice={slice} />
            ))}
          </div>
          {offer.partial && <SelfTransferNotice className="mt-3" />}
        </div>

        {/* boarding-pass stub: same dark board + signal treatment as the
            search card and auth card, so a result reads as "your ticket"
            rather than a generic list row */}
        <div className="flex shrink-0 flex-col gap-3 bg-board p-4 text-board-ink sm:w-48 sm:p-5">
          <p className="text-2xl font-bold tabular-nums text-board-ink">
            {formatMoney(offer.total_amount, offer.total_currency)}
          </p>

          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            className="text-left font-mono text-[11px] tracking-wide text-signal hover:underline"
            aria-expanded={detailOpen}
          >
            {detailOpen ? "HIDE DETAIL" : "VIEW DETAIL"}
          </button>

          <div className="mt-auto flex flex-col gap-2 border-t border-dashed border-board-line pt-3">
            <Button
              variant="outline"
              size="sm"
              className="border-board-line bg-transparent text-board-ink hover:bg-board-ink/10 hover:text-board-ink"
              onClick={() => onViewFares?.(offer)}
            >
              Compare fares
            </Button>
            <Button
              size="sm"
              className="bg-signal font-semibold text-white hover:bg-signal/90"
              onClick={() => onSelect?.(offer)}
            >
              Select
            </Button>
          </div>
        </div>
      </div>

      {detailOpen && (
        <div className="space-y-4 border-t border-dashed p-4 sm:p-5">
          {offer.slices.map((slice) => (
            <div key={slice.id}>
              <p className="mb-1 font-mono text-[11px] tracking-wide text-muted-foreground">
                {slice.origin.iata_code} → {slice.destination.iata_code}
              </p>
              <FlightItineraryTimeline segments={slice.segments.map(segmentFromOffer)} />
            </div>
          ))}
        </div>
      )}

      {alternates.length > 0 && (
        <div className="border-t border-dashed p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 font-mono text-[11px] tracking-wide text-signal hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? "SHOW FEWER FLIGHTS" : `SHOW MORE FLIGHTS (${alternates.length})`}
            <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <div className="mt-3 space-y-3">
              {alternates.map((alt) => (
                <div key={alt.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 divide-y divide-dashed">
                      {alt.slices.map((slice) => (
                        <SliceRow key={slice.id} slice={slice} />
                      ))}
                      {alt.partial && <SelfTransferNotice className="mt-3" />}
                    </div>
                    <div className="flex flex-col items-end gap-2 pl-3">
                      <p className="text-lg font-bold tabular-nums">
                        {formatMoney(alt.total_amount, alt.total_currency)}
                      </p>
                      <Button size="sm" className="bg-signal hover:bg-signal/90" onClick={() => onSelect?.(alt)}>
                        Select
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
