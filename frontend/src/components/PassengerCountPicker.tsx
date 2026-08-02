"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PassengerCounts {
  adults: number;
  children: number;
  infants: number;
}

interface PassengerCountPickerProps {
  value: PassengerCounts;
  onChange: (value: PassengerCounts) => void;
  triggerId?: string;
  className?: string;
}

const ROWS: {
  key: keyof PassengerCounts;
  label: string;
  description: string;
  min: number;
}[] = [
  { key: "adults", label: "Adults", description: "12+ years", min: 1 },
  { key: "children", label: "Children", description: "2–11 years", min: 0 },
  { key: "infants", label: "Infants", description: "Under 2, on lap", min: 0 },
];

/** Adults/children/infants counter, replacing the old adults-only Select.
 * Renders hidden form inputs so it drops into the existing FormData-based
 * search forms (SearchCard.tsx, search-bar.tsx) without changing how
 * those forms submit. Infants can't exceed adults (Duffel requires an
 * adult responsible for each infant passenger). */
export function PassengerCountPicker({
  value,
  onChange,
  triggerId,
  className,
}: PassengerCountPickerProps) {
  const total = value.adults + value.children + value.infants;

  function update(key: keyof PassengerCounts, delta: number) {
    const row = ROWS.find((r) => r.key === key)!;
    const next = { ...value, [key]: Math.max(row.min, value[key] + delta) };
    if (next.infants > next.adults) next.infants = next.adults;
    onChange(next);
  }

  return (
    <>
      <input type="hidden" name="adults" value={value.adults} />
      <input type="hidden" name="children" value={value.children} />
      <input type="hidden" name="infants" value={value.infants} />
      <Popover>
        <PopoverTrigger
          id={triggerId}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 w-full justify-between font-normal",
            className,
          )}
        >
          <span className="font-mono">
            {total} passenger{total > 1 ? "s" : ""}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-72">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Fewer ${row.label.toLowerCase()}`}
                  onClick={() => update(row.key, -1)}
                  disabled={value[row.key] <= row.min}
                  className="flex size-7 items-center justify-center rounded-full border border-input disabled:opacity-40"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-4 text-center text-sm tabular-nums">{value[row.key]}</span>
                <button
                  type="button"
                  aria-label={`More ${row.label.toLowerCase()}`}
                  onClick={() => update(row.key, 1)}
                  disabled={row.key === "infants" && value.infants >= value.adults}
                  className="flex size-7 items-center justify-center rounded-full border border-input disabled:opacity-40"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </PopoverContent>
      </Popover>
    </>
  );
}
