"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpDown, Loader2, MapPin, PlaneTakeoff } from "lucide-react";

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
import { compactLabelClass as labelClass } from "@/lib/utils";

type TripType = "one_way" | "round_trip";

function defaultDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  return date.toISOString().slice(0, 10);
}

/** The home page's flight-search console. Submits a real search to
 * /search — it is the primary entry point into the booking flow, not a
 * decorative mock. */
export default function SearchCard() {
  const router = useRouter();
  const [isSearching, startTransition] = useTransition();
  const [origin, setOrigin] = useState("OSL");
  const [destination, setDestination] = useState("JFK");
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [passengers, setPassengers] = useState<PassengerCounts>({
    adults: 1,
    children: 0,
    infants: 0,
  });

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  // Wrapped in a transition purely so the button can show progress: the
  // /search route fetches live Duffel fares during its server render, so
  // the push routinely takes several seconds. Without isPending the
  // click produces no visible response at all and reads as a dead button.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = searchHrefFromForm(new FormData(event.currentTarget), origin, destination);
    startTransition(() => router.push(href));
  }

  return (
    <Card id="search" className="overflow-hidden py-0 gap-0">
      <div className="flex items-center justify-between bg-board px-5 py-3 sm:px-6">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          FLIGHT SEARCH
        </span>
        {/* <span className="font-mono text-[11px] tracking-[0.25em] text-signal">
          COUNTER 01
        </span> */}
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4 p-5 sm:p-6">
        {/* origin/destination as one connected unit with a swap control */}
        <div className="col-span-2 grid gap-2">
          <div className="relative grid gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="home-origin" className={labelClass}>
                FROM
              </Label>
              <PlaceAutocomplete
                id="home-origin"
                value={origin}
                onValueChange={setOrigin}
                placeholder="OSL — Oslo"
                icon={
                  <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-signal" />
                }
                className="h-10 pl-8 font-mono uppercase"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="home-destination" className={labelClass}>
                TO
              </Label>
              <PlaceAutocomplete
                id="home-destination"
                value={destination}
                onValueChange={setDestination}
                placeholder="JFK — New York"
                icon={
                  <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-signal" />
                }
                className="h-10 pl-8 font-mono uppercase"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Swap origin and destination"
              onClick={swap}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-card"
            >
              <ArrowUpDown className="size-4" />
            </Button>
          </div>
        </div>

        <div role="radiogroup" aria-label="Trip type" className="col-span-2 flex gap-1.5">
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
              className={`border px-3 py-1.5 font-mono text-[10px] tracking-widest transition-colors ${
                tripType === option.value
                  ? "border-signal bg-signal text-white"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className={tripType === "one_way" ? "col-span-2 grid gap-1.5" : "grid gap-1.5"}>
          <Label htmlFor="home-depart" className={labelClass}>
            DEPART
          </Label>
          <Input
            id="home-depart"
            name="departure_date"
            type="date"
            defaultValue={defaultDepartureDate()}
            required
            className="h-10 font-mono"
          />
        </div>
        {tripType === "round_trip" && (
          <div className="grid gap-1.5">
            <Label htmlFor="home-return" className={labelClass}>
              RETURN
            </Label>
            <Input
              id="home-return"
              name="return_date"
              type="date"
              required
              className="h-10 font-mono"
            />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="home-cabin" className={labelClass}>
            CABIN
          </Label>
          <Select name="cabin_class" defaultValue="economy">
            <SelectTrigger id="home-cabin" className="h-10 w-full">
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
          <Label htmlFor="home-passengers" className={labelClass}>
            PASSENGERS
          </Label>
          <PassengerCountPicker
            triggerId="home-passengers"
            value={passengers}
            onChange={setPassengers}
            className="h-10"
          />
        </div>

        {/* ticket perforation before the tear-off action */}
        <div className="col-span-2 border-t border-dashed pt-4">
          <Button type="submit" size="lg" disabled={isSearching} className="w-full font-semibold">
            {isSearching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Searching live fares…
              </>
            ) : (
              "Search flights"
            )}
          </Button>
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            LIVE FARES · PRICE CONFIRMED BEFORE PAYMENT
          </p>
        </div>
      </form>
    </Card>
  );
}
