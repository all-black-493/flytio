"use client";

import { Armchair } from "lucide-react";

import type { OfferPassenger, SeatElement, SeatMap } from "@/lib/api/schemas";

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

/** Availability and pricing are per-passenger in Duffel's seat map — a seat
 * can be open for one passenger and not another, so this checks the
 * specific passenger, not a flat available/unavailable boolean. */
function serviceFor(element: SeatElement, passengerId: string) {
  return element.available_services?.find((s) => s.passenger_id === passengerId);
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

function SeatCell({
  element,
  selectedByActive,
  takenByLabel,
  service,
  onSelect,
}: {
  element: SeatElement;
  selectedByActive: boolean;
  takenByLabel: string | null;
  service: ReturnType<typeof serviceFor>;
  onSelect: () => void;
}) {
  if (element.type !== "seat") {
    // non-seat elements (galley, lavatory, exit row, etc.) just reserve
    // their grid position so the layout stays true to the aircraft
    return <div className="size-9" aria-hidden />;
  }

  const designator = element.designator ?? "?";
  const available = service !== undefined;
  const canSelect = available && !takenByLabel;
  const isFree = available && parseFloat(service.total_amount) === 0;

  return (
    <button
      type="button"
      disabled={!canSelect && !selectedByActive}
      onClick={() => canSelect && onSelect()}
      aria-label={
        takenByLabel
          ? `Seat ${designator} (taken by ${takenByLabel})`
          : available
            ? `Seat ${designator}${isFree ? "" : `, ${service.total_currency} ${service.total_amount}`}`
            : `Seat ${designator} (unavailable)`
      }
      aria-pressed={selectedByActive}
      title={
        takenByLabel
          ? `Taken by ${takenByLabel}`
          : available && !isFree
            ? `${service.total_currency} ${service.total_amount}`
            : undefined
      }
      className={`flex size-9 flex-col items-center justify-center rounded-lg border font-mono text-[9px] leading-none transition-colors ${
        selectedByActive
          ? "border-signal bg-signal text-white"
          : takenByLabel
            ? "cursor-not-allowed border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground"
            : available
              ? "border-border bg-card text-foreground hover:border-signal hover:text-signal"
              : "cursor-not-allowed border-transparent bg-muted text-muted-foreground/50"
      }`}
    >
      <Armchair className="size-3.5" />
      <span>{designator}</span>
      {available && !isFree && !selectedByActive && (
        <span className="text-[7px] text-signal">{Math.round(parseFloat(service.total_amount))}</span>
      )}
    </button>
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
      <div className="space-y-8">
        {seatMap.cabins.map((cabin, cabinIndex) => (
          <div key={cabinIndex} className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              {cabin.cabin_class.replace("_", " ").toUpperCase()}
            </p>
            <div className="flex flex-col items-center gap-1.5 rounded-xl border bg-muted/30 p-4">
              {cabin.rows.map((row, rowIndex) => (
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
                            selectedByActive={
                              designator === selectedSeats[activePassengerId]?.designator
                            }
                            takenByLabel={designator ? (takenBy.get(designator) ?? null) : null}
                            service={service}
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
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
