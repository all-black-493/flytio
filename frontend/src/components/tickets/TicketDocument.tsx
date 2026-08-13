import { AirlineLogo } from "@/components/AirlineLogo";
import { formatShortDate, formatTime } from "@/lib/api/format";
import type { BookingPassengerPublic, BookingPublic, BookingSlicePublic } from "@/lib/api/schemas";

/** Where a real boarding pass prints a gate. flyt never knows it: gates
 * are assigned by the airline at check-in, often hours before departure,
 * and Duffel exposes no such field. Saying so plainly is the whole reason
 * this document doesn't call itself a boarding pass. */
const GATE_PLACEHOLDER = "At check-in";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="truncate font-mono text-[13px] font-medium">{value}</p>
    </div>
  );
}

/** Origin → destination with the dashed flight path between, the figure
 * every airline ticket leads with. The codes carry the weight; the city
 * sits under them, quieter, because a traveller scans for NBO before
 * they read "Nairobi". */
function RouteHeader({ slice }: { slice: BookingSlicePublic }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
      <div>
        <p className="font-heading text-3xl leading-none font-bold tracking-tight">
          {slice.origin_iata_code}
        </p>
        <p className="mt-1 truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {slice.origin_city_name ?? slice.origin_name ?? ""}
        </p>
      </div>

      <div aria-hidden className="flex items-center gap-1 px-1">
        <span className="size-1.5 rounded-full bg-signal" />
        <span className="h-px flex-1 border-t border-dashed border-muted-foreground/50" />
        {/* Inline so it prints: a background-image plane would be dropped
            by browsers' "don't print backgrounds" default. */}
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-signal">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
        </svg>
        <span className="h-px flex-1 border-t border-dashed border-muted-foreground/50" />
        <span className="size-1.5 rounded-full bg-signal" />
      </div>

      <div className="text-right">
        <p className="font-heading text-3xl leading-none font-bold tracking-tight">
          {slice.destination_iata_code}
        </p>
        <p className="mt-1 truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {slice.destination_city_name ?? slice.destination_name ?? ""}
        </p>
      </div>
    </div>
  );
}

export interface TicketDocumentProps {
  booking: BookingPublic;
  passenger: BookingPassengerPublic;
  slice: BookingSlicePublic;
  /** Absolute URL of the QR image for this booking, served by the API so
   * the same verification code appears here and on the PDF. */
  qrSrc: string;
}

/**
 * One traveller's ticket for one leg, as a printable artefact.
 *
 * Deliberately a torn-stub ticket rather than another rounded card: the
 * stub, the perforation and the monospace data grid are what make it read
 * as a travel document you'd print and carry. That vocabulary is already
 * in the product - the search result card uses the same dark board stub -
 * so this extends the system rather than inventing a look for one screen.
 *
 * It is an E-TICKET, never a boarding pass. Only the airline can issue
 * one of those, at check-in, and a document that implies otherwise invites
 * a traveller to skip check-in and miss the flight.
 */
export function TicketDocument({ booking, passenger, slice, qrSrc }: TicketDocumentProps) {
  const firstFlight = slice.flights[0];
  const lastFlight = slice.flights[slice.flights.length - 1];
  const flightNumber = firstFlight
    ? `${firstFlight.marketing_carrier_iata_code ?? ""}${firstFlight.marketing_carrier_flight_number ?? ""}`
    : "—";
  const ticketNumber = passenger.tickets[0]?.ticket_number;

  return (
    <article
      // print:break-inside-avoid so a ticket is never torn across two
      // sheets - the one thing that would make a printed copy useless.
      className="grid break-inside-avoid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-[1fr_auto]"
    >
      {/* ---- main body ------------------------------------------------ */}
      <div className="min-w-0 space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground">
            E-TICKET
          </span>
          <span className="flex items-center gap-1.5">
            <AirlineLogo
              logoUrl={firstFlight?.marketing_carrier_logo_url}
              iataCode={booking.owner_iata_code}
              name={booking.owner_name ?? "Airline"}
              className="size-7 text-[10px]"
            />
            <span className="truncate font-mono text-[11px]">{booking.owner_name ?? ""}</span>
          </span>
        </div>

        <RouteHeader slice={slice} />

        <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-muted-foreground">
          <span>{firstFlight ? formatShortDate(firstFlight.departing_at) : ""}</span>
          <span className="tabular-nums">
            {firstFlight ? formatTime(firstFlight.departing_at) : "--:--"}
            {" → "}
            {lastFlight ? formatTime(lastFlight.arriving_at) : "--:--"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-dashed pt-3 sm:grid-cols-4">
          <Field
            label="Passenger"
            value={`${passenger.given_name} ${passenger.family_name}`}
          />
          <Field label="Flight" value={flightNumber || "—"} />
          <Field label="Seat" value={passenger.seat_designator ?? GATE_PLACEHOLDER} />
          <Field label="Gate" value={GATE_PLACEHOLDER} />
        </div>
      </div>

      {/* ---- perforation + stub --------------------------------------
          The tear line is a real edge, not decoration: it's the border
          between "your copy" and the detail, and it's what makes the
          artefact legible as a ticket at a glance. Horizontal on phones,
          vertical from sm up, so the stub never squeezes the route. */}
      <div
        aria-hidden
        className="border-t border-dashed border-muted-foreground/40 sm:border-t-0 sm:border-l"
      />
      <div className="flex shrink-0 items-center gap-4 bg-board p-4 text-board-ink sm:w-44 sm:flex-col sm:items-stretch sm:gap-3 sm:p-5">
        <div className="min-w-0 flex-1 space-y-2 sm:flex-none">
          <p className="font-mono text-[10px] tracking-[0.22em] text-board-muted">
            {booking.booking_reference}
          </p>
          <p className="font-mono text-[13px] font-medium">
            {slice.origin_iata_code} → {slice.destination_iata_code}
          </p>
          {ticketNumber && (
            <p className="truncate font-mono text-[10px] text-board-muted">{ticketNumber}</p>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- API-rendered
            QR, deliberately unoptimised so the printed copy is the exact
            bitmap the PDF carries. */}
        <img
          src={qrSrc}
          alt={`QR code for booking ${booking.booking_reference}`}
          className="size-20 shrink-0 rounded bg-white p-1 sm:size-auto sm:w-full"
        />
      </div>
    </article>
  );
}
