import { Clock, Plane } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { formatDuration, formatShortDate, formatTime } from "@/lib/api/format";
import type { FlightPublic, OfferSegment } from "@/lib/api/schemas";

export interface TimelineSegment {
  id: string;
  originCode: string;
  originName?: string | null;
  destinationCode: string;
  destinationName?: string | null;
  departingAt: string;
  arrivingAt: string;
  duration?: string | null;
  carrierName?: string | null;
  carrierIataCode?: string | null;
  carrierLogoUrl?: string | null;
  flightNumber?: string | null;
  operatingCarrierName?: string | null;
  aircraftName?: string | null;
}

/** OfferSegment (search results, pre-booking offers) -> TimelineSegment. */
export function segmentFromOffer(segment: OfferSegment): TimelineSegment {
  return {
    id: segment.id,
    originCode: segment.origin.iata_code ?? "?",
    originName: segment.origin.name,
    destinationCode: segment.destination.iata_code ?? "?",
    destinationName: segment.destination.name,
    departingAt: segment.departing_at,
    arrivingAt: segment.arriving_at,
    duration: segment.duration,
    carrierName: segment.marketing_carrier?.name,
    carrierIataCode: segment.marketing_carrier?.iata_code,
    carrierLogoUrl: segment.marketing_carrier?.logo_symbol_url,
    flightNumber: segment.marketing_carrier_flight_number,
    operatingCarrierName: segment.operating_carrier?.name,
    aircraftName: segment.aircraft?.name,
  };
}

/** FlightPublic (persisted booking, from our own DB) -> TimelineSegment. */
export function segmentFromFlight(flight: FlightPublic): TimelineSegment {
  return {
    id: flight.id,
    originCode: flight.origin_iata_code,
    originName: flight.origin_name,
    destinationCode: flight.destination_iata_code,
    destinationName: flight.destination_name,
    departingAt: flight.departing_at,
    arrivingAt: flight.arriving_at,
    duration: flight.duration,
    carrierName: flight.marketing_carrier_name,
    carrierIataCode: flight.marketing_carrier_iata_code,
    carrierLogoUrl: flight.marketing_carrier_logo_url,
    flightNumber: flight.marketing_carrier_flight_number,
    operatingCarrierName: flight.operating_carrier_name,
    aircraftName: flight.aircraft_name,
  };
}

export function layoverMinutes(prevArrivingAt: string, nextDepartingAt: string): number {
  const ms = new Date(nextDepartingAt).getTime() - new Date(prevArrivingAt).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

export function formatLayoverDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && `${hours}h`, rest && `${rest}m`].filter(Boolean).join(" ") || "0m";
}

// A connection under 3h is routine; at or beyond that it's worth flagging
// as a long layover so a traveler isn't surprised by it after booking.
const LONG_LAYOVER_MINUTES = 180;

function LayoverDivider({ airportCode, minutes }: { airportCode: string; minutes: number }) {
  const long = minutes >= LONG_LAYOVER_MINUTES;
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="h-px flex-1 border-t border-dashed border-border" />
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wide whitespace-nowrap ${
          long
            ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
            : "border-border text-muted-foreground"
        }`}
      >
        <Clock className="size-3" />
        {formatLayoverDuration(minutes)} layover · {airportCode}
      </span>
      <span className="h-px flex-1 border-t border-dashed border-border" />
    </div>
  );
}

function SegmentRow({ segment }: { segment: TimelineSegment }) {
  const operatedBy =
    segment.operatingCarrierName && segment.operatingCarrierName !== segment.carrierName
      ? segment.operatingCarrierName
      : null;

  return (
    <div className="space-y-2 py-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <div>
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(segment.departingAt)}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
            {segment.originCode}
          </p>
        </div>

        <div className="flex flex-col items-center px-2">
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
            {segment.duration ? formatDuration(segment.duration) : ""}
          </span>
          <div className="flex w-full items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-signal/50" />
            <span className="h-px flex-1 bg-border" />
            <Plane className="size-3 rotate-90 text-signal" />
            <span className="h-px flex-1 bg-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-signal/50" />
          </div>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(segment.arrivingAt)}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
            {segment.destinationCode}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <AirlineLogo
          logoUrl={segment.carrierLogoUrl}
          iataCode={segment.carrierIataCode}
          name={segment.carrierName}
          className="size-4"
        />
        <span>
          {segment.carrierName} {segment.flightNumber}
        </span>
        <span>· {formatShortDate(segment.departingAt)}</span>
        {segment.aircraftName && <span>· {segment.aircraftName}</span>}
      </div>
      {operatedBy && (
        <p className="font-mono text-[11px] text-muted-foreground">Operated by {operatedBy}</p>
      )}
    </div>
  );
}

/** Visual flight-by-flight timeline for one slice, including a distinct
 * layover indicator (duration + airport) between connecting segments -
 * shared by search results, the booking flow, and a past booking's
 * detail page so all three show stops the same way. */
export function FlightItineraryTimeline({ segments }: { segments: TimelineSegment[] }) {
  return (
    <div className="divide-y divide-dashed">
      {segments.map((segment, index) => (
        <div key={segment.id}>
          {index > 0 && (
            <LayoverDivider
              airportCode={segment.originCode}
              minutes={layoverMinutes(segments[index - 1].arrivingAt, segment.departingAt)}
            />
          )}
          <SegmentRow segment={segment} />
        </div>
      ))}
    </div>
  );
}
