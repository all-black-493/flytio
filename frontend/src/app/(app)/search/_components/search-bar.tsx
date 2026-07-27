"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, MapPin, PlaneTakeoff } from "lucide-react";

import { PassengerCountPicker, type PassengerCounts } from "@/components/PassengerCountPicker";
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
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
import { compactLabelClass as labelClass } from "@/lib/utils";

type TripType = "one_way" | "round_trip";

export interface SearchBarProps {
  defaultOrigin?: string;
  defaultDestination?: string;
  defaultDepartureDate?: string;
  defaultReturnDate?: string;
  defaultAdults?: number;
  defaultChildren?: number;
  defaultInfants?: number;
  defaultCabinClass?: CabinClass;
}

export function SearchBar({
  defaultOrigin = "",
  defaultDestination = "",
  defaultDepartureDate = "",
  defaultReturnDate = "",
  defaultAdults = 1,
  defaultChildren = 0,
  defaultInfants = 0,
  defaultCabinClass = "economy",
}: SearchBarProps) {
  const router = useRouter();
  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState(defaultDestination);
  const [tripType, setTripType] = useState<TripType>(
    defaultReturnDate ? "round_trip" : "one_way",
  );
  const [passengers, setPassengers] = useState<PassengerCounts>({
    adults: defaultAdults,
    children: defaultChildren,
    infants: defaultInfants,
  });

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
            <PlaceAutocomplete
              id="origin"
              value={origin}
              onValueChange={setOrigin}
              placeholder="OSL — Oslo"
              icon={
                <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-signal" />
              }
              className="pl-8 font-mono uppercase"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="destination" className={labelClass}>
              TO
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <PlaceAutocomplete
                  id="destination"
                  value={destination}
                  onValueChange={setDestination}
                  placeholder="JFK — New York"
                  icon={
                    <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-signal" />
                  }
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
            <Label htmlFor="passengers" className={labelClass}>
              PASSENGERS
            </Label>
            <PassengerCountPicker
              triggerId="passengers"
              value={passengers}
              onChange={setPassengers}
            />
          </div>

          <Button type="submit" className="bg-signal font-semibold hover:bg-signal/90 lg:col-span-6">
            Search flights
          </Button>
        </div>
      </form>
    </Card>
  );
}
