"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, MapPin, PlaneTakeoff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchHrefFromForm } from "@/lib/search-params";
import type { CabinClass } from "@/lib/api/schemas";

const labelClass = "font-mono text-[10px] tracking-[0.2em] text-muted-foreground";

type TripType = "one_way" | "round_trip";

export interface SearchBarProps {
  defaultOrigin?: string;
  defaultDestination?: string;
  defaultDepartureDate?: string;
  defaultReturnDate?: string;
  defaultAdults?: number;
  defaultCabinClass?: CabinClass;
}

export function SearchBar({
  defaultOrigin = "",
  defaultDestination = "",
  defaultDepartureDate = "",
  defaultReturnDate = "",
  defaultAdults = 1,
  defaultCabinClass = "economy",
}: SearchBarProps) {
  const router = useRouter();
  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState(defaultDestination);
  const [tripType, setTripType] = useState<TripType>(
    defaultReturnDate ? "round_trip" : "one_way",
  );

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(searchHrefFromForm(new FormData(event.currentTarget), origin, destination));
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex items-center justify-between bg-board px-5 py-2.5">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          MODIFY SEARCH
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">
          {origin || "—"} → {destination || "—"}
        </span>
      </div>
      <form onSubmit={onSubmit}>
        <div
          role="radiogroup"
          aria-label="Trip type"
          className="flex gap-1.5 px-4 pt-4 sm:px-5 sm:pt-5"
        >
          {(
            [
              { value: "one_way", label: "One way" },
              { value: "round_trip", label: "Round trip" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={tripType === option.value}
              onClick={() => setTripType(option.value)}
              className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-widest transition-colors ${
                tripType === option.value
                  ? "border-signal bg-signal text-white"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] sm:items-end sm:p-5">
          <div className="grid gap-1.5">
            <Label htmlFor="origin" className={labelClass}>
              FROM
            </Label>
            <div className="relative">
              <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-signal" />
              <Input
                id="origin"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="OSL — Oslo"
                required
                className="pl-8 font-mono uppercase"
              />
            </div>
          </div>

          <div className="relative grid gap-1.5">
            <Label htmlFor="destination" className={labelClass}>
              TO
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-signal" />
                <Input
                  id="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="JFK — New York"
                  required
                  className="pl-8 font-mono uppercase"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Swap origin and destination"
                onClick={swap}
                className="shrink-0"
              >
                <ArrowLeftRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="departure_date" className={labelClass}>
              DEPART
            </Label>
            <Input
              id="departure_date"
              name="departure_date"
              type="date"
              defaultValue={defaultDepartureDate}
              required
              className="font-mono"
            />
          </div>

          {tripType === "round_trip" && (
            <div className="grid gap-1.5">
              <Label htmlFor="return_date" className={labelClass}>
                RETURN
              </Label>
              <Input
                id="return_date"
                name="return_date"
                type="date"
                defaultValue={defaultReturnDate}
                required
                className="font-mono"
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="cabin_class" className={labelClass}>
              CABIN
            </Label>
            <Select name="cabin_class" defaultValue={defaultCabinClass}>
              <SelectTrigger id="cabin_class" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="economy">Economy</SelectItem>
                <SelectItem value="premium_economy">Premium economy</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="first">First</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adults" className={labelClass}>
              ADULTS
            </Label>
            <Select name="adults" defaultValue={String(defaultAdults)}>
              <SelectTrigger id="adults" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} adult{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="bg-signal font-semibold hover:bg-signal/90 lg:col-span-6">
            Search flights
          </Button>
        </div>
      </form>
    </Card>
  );
}
