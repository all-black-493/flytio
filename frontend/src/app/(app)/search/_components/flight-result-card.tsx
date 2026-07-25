"use client";

import { useState } from "react";
import { ChevronDown, PlaneTakeoff } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDuration, formatMoney, formatShortDate, formatTime, stopsLabel } from "@/lib/api/format";
import type { Offer, OfferSlice } from "@/lib/api/schemas";

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
          via {slice.segments.slice(0, -1).map((s) => s.destination.iata_code).join(", ")}
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

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col sm:flex-row">
        {/* itinerary — clean, scannable, light surface */}
        <div className="min-w-0 flex-1 divide-y divide-dashed p-4 sm:p-5">
          {offer.slices.map((slice) => (
            <SliceRow key={slice.id} slice={slice} />
          ))}
        </div>

        {/* boarding-pass stub: same dark board + signal treatment as the
            search card and auth card, so a result reads as "your ticket"
            rather than a generic list row */}
        <div className="flex shrink-0 flex-col gap-3 bg-board p-4 text-board-ink sm:w-48 sm:p-5">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <AirlineLogo
              logoUrl={airlineLogoUrl}
              iataCode={airlineIataCode}
              name={airline}
              className="size-12"
              fallbackClassName="bg-board-ink/10 text-sm text-board-ink"
            />
            <span className="line-clamp-2 text-sm font-medium text-board-ink">{airline}</span>
          </div>

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
        <div className="grid gap-3 border-t border-dashed p-4 sm:grid-cols-2 sm:p-5">
          {offer.slices.flatMap((slice) =>
            slice.segments.map((segment) => (
              <div key={segment.id} className="rounded-lg bg-muted/50 p-3 font-mono text-xs">
                <p className="text-foreground">
                  {segment.origin.iata_code} {formatTime(segment.departing_at)} →{" "}
                  {segment.destination.iata_code} {formatTime(segment.arriving_at)}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {segment.marketing_carrier?.iata_code} {segment.marketing_carrier_flight_number} ·{" "}
                  {segment.aircraft?.name ?? "Aircraft n/a"} · {formatDuration(segment.duration)}
                </p>
                <p className="mt-1 text-muted-foreground">{formatShortDate(segment.departing_at)}</p>
              </div>
            )),
          )}
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
