"use client";

import { SeatCell } from "@/app/(app)/booking/[offerId]/_components/seat-cell";
import { rowHasExit, seatPosition, serviceFor } from "@/app/(app)/booking/[offerId]/_lib/seat-map";
import type { OfferPassenger, SeatMap } from "@/lib/api/schemas";

export interface SeatPick {
  designator: string;
  /** Duffel's ase_... id for THIS passenger's seat - sent to checkout so
   * the seat is actually reserved with the airline, not just recorded on
   * our own booking record. */
  serviceId: string;
  amount: string;
  currency: string;
}

export interface SeatPickerProps {
  seatMap: SeatMap;
  /** Seat-eligible passengers only (infant_without_seat is filtered out by
   * the caller — lap infants don't get their own seat). */
  passengers: OfferPassenger[];
  activePassengerId: string;
  onActivePassengerChange: (passengerId: string) => void;
  /** passengerId -> picked seat */
  selectedSeats: Record<string, SeatPick>;
  onSelect: (passengerId: string, pick: SeatPick) => void;
}

function PassengerTabs({
  passengers,
  activePassengerId,
  onActivePassengerChange,
  selectedSeats,
}: {
  passengers: OfferPassenger[];
  activePassengerId: string;
  onActivePassengerChange: (passengerId: string) => void;
  selectedSeats: Record<string, SeatPick>;
}) {
  return (
    <div role="tablist" aria-label="Select a seat for" className="flex flex-wrap gap-1.5">
      {passengers.map((passenger, index) => {
        const active = passenger.id === activePassengerId;
        const seat = selectedSeats[passenger.id];
        return (
          <button
            key={passenger.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onActivePassengerChange(passenger.id)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-widest transition-colors ${
              active
                ? "border-signal bg-signal text-white"
                : "border-input text-muted-foreground hover:text-foreground"
            }`}
          >
            PASSENGER {index + 1}
            {seat ? ` · ${seat.designator}` : ""}
          </button>
        );
      })}
    </div>
  );
}

export function SeatPicker({
  seatMap,
  passengers,
  activePassengerId,
  onActivePassengerChange,
  selectedSeats,
  onSelect,
}: SeatPickerProps) {
  // designator -> "PASSENGER N" label, for every OTHER passenger's pick
  const takenBy = new Map<string, string>();
  passengers.forEach((passenger, index) => {
    if (passenger.id === activePassengerId) return;
    const seat = selectedSeats[passenger.id];
    if (seat) takenBy.set(seat.designator, `PASSENGER ${index + 1}`);
  });

  // Only worth naming the traveller on the select button when there's
  // more than one of them to choose between.
  const activeIndex = passengers.findIndex((p) => p.id === activePassengerId);
  const activePassengerLabel =
    passengers.length > 1 && activeIndex !== -1 ? `PASSENGER ${activeIndex + 1}` : null;

  return (
    <div className="space-y-4">
      {passengers.length > 1 && (
        <PassengerTabs
          passengers={passengers}
          activePassengerId={activePassengerId}
          onActivePassengerChange={onActivePassengerChange}
          selectedSeats={selectedSeats}
        />
      )}
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
        Hover or tap a seat for its details
      </p>
      <div className="space-y-8">
        {seatMap.cabins.map((cabin, cabinIndex) => (
          <div key={cabinIndex} className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              {cabin.cabin_class.replace("_", " ").toUpperCase()}
            </p>
            {/* The map scrolls inside its own box rather than dragging the whole
                page sideways: a 3-3-3 row is wider than a phone viewport at any
                legible seat size (it already was at the previous 36px cells).
                w-max lets the rows keep their natural width, min-w-full keeps
                them centred on the wide screens where they do fit. */}
            <div className="overflow-x-auto rounded-xl border bg-muted/30">
              <div className="flex w-max min-w-full flex-col items-center gap-1.5 p-4">
                {cabin.rows.map((row, rowIndex) => {
                  const inExitRow = rowHasExit(row);
                  return (
                    <div key={rowIndex} className="flex items-center gap-4">
                      {row.sections.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="flex gap-1.5">
                          {section.elements.map((element, elementIndex) => {
                            const designator = element.designator;
                            const service = serviceFor(element, activePassengerId);
                            return (
                              <SeatCell
                                key={elementIndex}
                                element={element}
                                cabinClass={cabin.cabin_class}
                                position={seatPosition(row, sectionIndex, element)}
                                inExitRow={inExitRow}
                                service={service}
                                selectedByActive={
                                  designator === selectedSeats[activePassengerId]?.designator
                                }
                                takenByLabel={
                                  designator ? (takenBy.get(designator) ?? null) : null
                                }
                                activePassengerLabel={activePassengerLabel}
                                onSelect={() => {
                                  if (!designator || !service) return;
                                  onSelect(activePassengerId, {
                                    designator,
                                    serviceId: service.id,
                                    amount: service.total_amount,
                                    currency: service.total_currency,
                                  });
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
