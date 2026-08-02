import { Briefcase, Luggage, PlaneTakeoff } from "lucide-react";

import { AirlineLogo } from "@/components/AirlineLogo";
import { FlightItineraryTimeline, segmentFromFlight } from "@/components/FlightItineraryTimeline";
import { Card } from "@/components/ui/card";
import { formatMoney, formatShortDate, formatTime } from "@/lib/api/format";
import type { BookingPassengerPublic, BookingPublic, BookingSlicePublic } from "@/lib/api/schemas";

/** Shared building blocks for rendering one booking's full detail -
 * used by both the customer's own booking page (account/bookings/
 * [bookingId]) and the staff equivalent (admin/bookings/[bookingId]).
 * Deliberately has no actions (cancel/change dialogs, ticket upload
 * etc.) baked in - those differ per caller and are composed around
 * these, not inside them. */

/** Fare rules row - only rendered once the backend actually has a
 * refund/change verdict for this booking (older bookings predate this
 * persistence and will have both fields null). */
export function FareRulesCard({ booking }: { booking: BookingPublic }) {
  if (booking.refund_allowed === null && booking.change_allowed === null) return null;

  return (
    <Card className="gap-2 p-4">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">FARE RULES</p>
      <div className="space-y-1.5 text-sm">
        {booking.refund_allowed !== null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Refund</span>
            <span>
              {booking.refund_allowed ? "Allowed" : "Not allowed"}
              {booking.refund_allowed && booking.refund_penalty_amount && (
                <span className="text-muted-foreground">
                  {" "}
                  ({formatMoney(booking.refund_penalty_amount, booking.refund_penalty_currency!)}{" "}
                  fee)
                </span>
              )}
            </span>
          </div>
        )}
        {booking.change_allowed !== null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Changes</span>
            <span>
              {booking.change_allowed ? "Allowed" : "Not allowed"}
              {booking.change_allowed && booking.change_penalty_amount && (
                <span className="text-muted-foreground">
                  {" "}
                  ({formatMoney(booking.change_penalty_amount, booking.change_penalty_currency!)}{" "}
                  fee)
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

export function BaggageSummary({ passenger }: { passenger: BookingPassengerPublic }) {
  if (passenger.checked_bags === 0 && passenger.carry_on_bags === 0) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Briefcase className="size-3.5" />
        {passenger.carry_on_bags} carry-on
      </span>
      <span className="flex items-center gap-1">
        <Luggage className="size-3.5" />
        {passenger.checked_bags} checked
      </span>
    </div>
  );
}

export function SliceCard({ slice }: { slice: BookingSlicePublic }) {
  const first = slice.flights[0];
  const last = slice.flights[slice.flights.length - 1];
  if (!first || !last) return null;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-4 bg-board px-4 py-3 text-board-ink">
        <AirlineLogo
          logoUrl={first.marketing_carrier_logo_url}
          iataCode={first.marketing_carrier_iata_code}
          name={first.marketing_carrier_name}
          fallbackClassName="bg-board-ink/10 text-board-ink"
        />
        <div>
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(first.departing_at)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-board-muted">
            {slice.origin_iata_code} · {formatShortDate(first.departing_at)}
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center px-2">
          <div className="flex w-full items-center gap-1">
            <span className="h-px flex-1 bg-board-muted/40" />
            <PlaneTakeoff className="size-3.5 rotate-45 text-signal" />
            <span className="h-px flex-1 bg-board-muted/40" />
          </div>
          {slice.flights.length > 1 && (
            <span className="mt-1 font-mono text-[10px] text-board-muted">
              {slice.flights.length - 1} stop{slice.flights.length - 1 > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums leading-none">
            {formatTime(last.arriving_at)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-board-muted">
            {slice.destination_iata_code} · {formatShortDate(last.arriving_at)}
          </p>
        </div>
      </div>
      <div className="px-4">
        <FlightItineraryTimeline segments={slice.flights.map(segmentFromFlight)} />
      </div>
    </div>
  );
}
