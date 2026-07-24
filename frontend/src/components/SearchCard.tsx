"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpDown, MapPin, PlaneTakeoff } from "lucide-react";

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

const labelClass = "font-mono text-[10px] tracking-[0.2em] text-muted-foreground";

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
  const [origin, setOrigin] = useState("OSL");
  const [destination, setDestination] = useState("JFK");
  const [tripType, setTripType] = useState<TripType>("one_way");

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(searchHrefFromForm(new FormData(event.currentTarget), origin, destination));
  }

  return (
    <Card id="search" className="overflow-hidden py-0 gap-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-5 py-3 sm:px-6">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          FLIGHT SEARCH
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">
          COUNTER 01
        </span>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4 p-5 sm:p-6">
        {/* origin/destination as one connected unit with a swap control */}
        <div className="col-span-2 grid gap-2">
          <div className="relative grid gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="home-origin" className={labelClass}>
                FROM
              </Label>
              <div className="relative">
                <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-signal" />
                <Input
                  id="home-origin"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="OSL — Oslo"
                  autoComplete="off"
                  required
                  className="h-10 pl-8 font-mono uppercase"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="home-destination" className={labelClass}>
                TO
              </Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-signal" />
                <Input
                  id="home-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="JFK — New York"
                  autoComplete="off"
                  required
                  className="h-10 pl-8 font-mono uppercase"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Swap origin and destination"
              onClick={swap}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-card shadow-sm"
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
          <Label htmlFor="home-adults" className={labelClass}>
            PASSENGERS
          </Label>
          <Select name="adults" defaultValue="1">
            <SelectTrigger id="home-adults" className="h-10 w-full">
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

        {/* ticket perforation before the tear-off action */}
        <div className="col-span-2 border-t border-dashed pt-4">
          <Button type="submit" size="lg" className="w-full font-semibold">
            Search flights
          </Button>
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            LIVE FARES · PRICE CONFIRMED BEFORE PAYMENT
          </p>
        </div>
      </form>
    </Card>
  );
}
