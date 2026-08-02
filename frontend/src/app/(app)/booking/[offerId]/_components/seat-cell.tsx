"use client";

import { Armchair } from "lucide-react";

import {
  isIncluded,
  rowNumber,
  type SeatPosition,
} from "@/app/(app)/booking/[offerId]/_lib/seat-map";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/api/format";
import type { AvailableSeatService, CabinClass, SeatElement } from "@/lib/api/schemas";

/** Everything the cell needs to know about one seat, worked out by the
 * picker (which can see the whole row) and passed down. Keeping the
 * derivation out here means this component only decides how a seat
 * looks, never what it is. */
export interface SeatCellProps {
  element: SeatElement;
  cabinClass: CabinClass;
  position: SeatPosition;
  inExitRow: boolean;
  /** The service for the ACTIVE passenger — undefined when this seat
   * isn't on offer to them, which is not the same as the seat being
   * physically absent. */
  service: AvailableSeatService | undefined;
  selectedByActive: boolean;
  /** "PASSENGER 2" when another traveller already holds this seat. */
  takenByLabel: string | null;
  /** Null when there's only one traveller, so the button can say plain
   * "Select seat" instead of naming a passenger nobody chose between. */
  activePassengerLabel: string | null;
  onSelect: () => void;
}

const POSITION_LABEL: Record<SeatPosition, string> = {
  window: "Window",
  aisle: "Aisle",
  middle: "Middle",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

/** The spoken description, kept deliberately complete: a screen-reader
 * user gets the whole story from the button itself and never has to
 * open the popover to find out what a seat is. */
function seatAriaLabel({
  designator,
  position,
  service,
  takenByLabel,
}: {
  designator: string;
  position: SeatPosition;
  service: AvailableSeatService | undefined;
  takenByLabel: string | null;
}): string {
  const where = `Seat ${designator}, ${POSITION_LABEL[position].toLowerCase()}`;
  if (takenByLabel) return `${where} (taken by ${takenByLabel})`;
  if (!service) return `${where} (unavailable)`;
  if (isIncluded(service)) return `${where}, included`;
  return `${where}, ${formatMoney(service.total_amount, service.total_currency)}`;
}

export function SeatCell({
  element,
  cabinClass,
  position,
  inExitRow,
  service,
  selectedByActive,
  takenByLabel,
  activePassengerLabel,
  onSelect,
}: SeatCellProps) {
  if (element.type !== "seat") {
    // Non-seat elements (galley, lavatory, exit row marker) hold their
    // grid position so the layout stays true to the aircraft.
    return <div className="size-11" aria-hidden />;
  }

  const designator = element.designator ?? "?";
  const available = service !== undefined;
  const canSelect = available && !takenByLabel;
  const included = available && isIncluded(service);
  const row = rowNumber(element.designator);
  const disclosures = element.disclosures ?? [];

  return (
    <Popover>
      <PopoverTrigger
        // openOnHover covers the mouse; because this stays a real
        // button, tap and keyboard focus open the same popover, so
        // touch users aren't left with a hover-only affordance.
        openOnHover
        delay={120}
        closeDelay={80}
        render={
          <button
            type="button"
            // aria-disabled, never the `disabled` attribute: a disabled
            // button fires no mouse events and takes no focus, so an
            // unavailable or already-taken seat would be the one seat
            // whose popover never opens - and "why can't I pick this
            // one?" is exactly the question a traveller has there.
            // Nothing is selectable from those popovers anyway (the
            // action is replaced by an explanation below), so there's no
            // click to guard against.
            aria-disabled={!canSelect && !selectedByActive}
            aria-label={seatAriaLabel({ designator, position, service, takenByLabel })}
            aria-pressed={selectedByActive}
            className={`relative flex size-11 flex-col items-center justify-center gap-0.5 rounded-lg border font-mono text-[11px] leading-none transition-colors ${
              selectedByActive
                ? "border-signal bg-signal text-white"
                : takenByLabel
                  ? "cursor-not-allowed border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground"
                  : available
                    ? "border-border bg-card text-foreground hover:border-signal hover:text-signal"
                    : "cursor-not-allowed border-transparent bg-muted text-muted-foreground/50"
            }`}
          >
            <Armchair className="size-4" />
            <span>{designator}</span>
            {available && !included && !selectedByActive && (
              // Marks a seat that costs extra. The exact amount is in
              // the popover - at this size a price reads as noise.
              <span
                className="absolute top-1 right-1 size-1.5 rounded-full bg-signal"
                aria-hidden
              />
            )}
          </button>
        }
      />

      <PopoverContent side="top" className="w-64 gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tracking-tight">{designator}</span>
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            {cabinClass.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          <Chip>{POSITION_LABEL[position].toUpperCase()}</Chip>
          {row !== null && <Chip>ROW {row}</Chip>}
          {inExitRow && <Chip>EXIT ROW</Chip>}
        </div>

        {/* Duffel's own label, shown only when the airline actually set
            one - it is an empty string on most seats. */}
        {element.name ? <p className="text-sm">{element.name}</p> : null}

        {available && (
          <p className="text-lg font-semibold">
            {included ? (
              <span className="text-muted-foreground">Included</span>
            ) : (
              formatMoney(service.total_amount, service.total_currency)
            )}
          </p>
        )}

        {disclosures.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {disclosures.map((disclosure) => (
              <li key={disclosure}>{disclosure}</li>
            ))}
          </ul>
        )}

        {takenByLabel ? (
          <p className="text-xs text-muted-foreground">Taken by {takenByLabel}</p>
        ) : !available ? (
          <p className="text-xs text-muted-foreground">Not available for this traveller</p>
        ) : selectedByActive ? (
          <p className="font-mono text-[11px] tracking-widest text-signal">SELECTED</p>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="w-full rounded-lg bg-signal px-3 py-2 font-mono text-[11px] tracking-widest text-white transition-opacity hover:opacity-90"
          >
            {activePassengerLabel ? `SELECT FOR ${activePassengerLabel}` : "SELECT SEAT"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
