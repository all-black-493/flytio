"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";

import { DEFAULT_ORIGIN_IATA_CODE, popularDestinationsQuery, thirtyDaysFromNow } from "@/lib/api/queries";

/** Real booking-derived popularity, or nothing at all - never a curated
 * fallback list and never an empty-looking box. The backend already
 * applies a real-signal threshold (routers/flights.py's
 * PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS), so this component's only job is to
 * stay silent until there's something real to show. */
export default function PopularDestinations() {
  const { data, isPending, isError } = useQuery(popularDestinationsQuery());

  if (isPending || isError) return null;
  if (data.length === 0) return null;

  const departureDate = thirtyDaysFromNow();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <h2 className="mb-4 font-mono text-xs tracking-[0.3em] text-muted-foreground">
        POPULAR DESTINATIONS
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {data.map((route) => (
          <Link
            key={`${route.origin_iata_code}-${route.destination_iata_code}`}
            href={`/search?origin=${DEFAULT_ORIGIN_IATA_CODE}&destination=${route.destination_iata_code}&departure_date=${departureDate}`}
            className="group rounded-xl border p-4 transition-colors hover:bg-muted/50"
          >
            <PlaneTakeoff className="mb-2 size-4 text-signal" />
            <p className="font-semibold">
              {route.destination_city_name ?? route.destination_iata_code}
            </p>
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
              {route.destination_iata_code}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
