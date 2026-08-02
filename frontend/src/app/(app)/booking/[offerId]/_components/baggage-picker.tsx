"use client";

import { Luggage } from "lucide-react";

import type { AvailableService, OfferPassenger } from "@/lib/api/schemas";
import { formatMoney } from "@/lib/api/format";

export interface BaggagePickerProps {
  services: AvailableService[];
  /** Seat-eligible passengers, same list SeatPicker uses. */
  passengers: OfferPassenger[];
  /** passengerId -> set of selected baggage service ids. */
  selected: Record<string, Set<string>>;
  onToggle: (passengerId: string, serviceId: string) => void;
}

/** Extra checked baggage, purchasable at booking time via the same
 * paid-service mechanism as seats (Offer.available_services, type
 * "baggage") - one checkbox per service, since a multi-segment trip
 * typically needs a separate purchase per segment for the same bag. */
export function BaggagePicker({ services, passengers, selected, onToggle }: BaggagePickerProps) {
  const baggageServices = services.filter((s) => s.type === "baggage");
  if (baggageServices.length === 0) return null;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
        EXTRA BAGGAGE
      </p>
      {passengers.map((passenger, index) => {
        const forPassenger = baggageServices.filter((s) =>
          s.passenger_ids.includes(passenger.id),
        );
        if (forPassenger.length === 0) return null;

        return (
          <div key={passenger.id} className="space-y-2">
            <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
              PASSENGER {index + 1}
            </p>
            <div className="space-y-1.5">
              {forPassenger.map((service, serviceIndex) => {
                const checked = selected[passenger.id]?.has(service.id) ?? false;
                return (
                  <label
                    key={service.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:border-signal"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(passenger.id, service.id)}
                      className="size-4 accent-signal"
                    />
                    <Luggage className="size-4 text-muted-foreground" />
                    <span className="flex-1">
                      Extra checked bag{forPassenger.length > 1 ? ` (leg ${serviceIndex + 1})` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(service.total_amount, service.total_currency)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
