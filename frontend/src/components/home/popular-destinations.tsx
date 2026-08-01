"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";

import { DEFAULT_ORIGIN_IATA_CODE, popularDestinationsQuery, thirtyDaysFromNow } from "@/lib/api/queries";

/** The fixed half of Unsplash's required "Photo by X on Unsplash" credit
 * - the photographer half (destination_image_attribution_url) is already
 * utm-tagged server-side (external_services/unsplash.py's with_utm),
 * since that link is per-photo data; this one is a constant, so it's
 * just tagged once here rather than stored per row. */
const UNSPLASH_HOMEPAGE_URL = "https://unsplash.com/?utm_source=flyt&utm_medium=referral";

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
          <div key={`${route.origin_iata_code}-${route.destination_iata_code}`} className="group relative">
            <Link
              href={`/search?origin=${DEFAULT_ORIGIN_IATA_CODE}&destination=${route.destination_iata_code}&departure_date=${departureDate}`}
              className="relative block aspect-4/5 overflow-hidden rounded-xl border"
            >
              {route.destination_image_url ? (
                // unoptimized: Unsplash's API guidelines require these
                // URLs to be hotlinked as-is (photo.urls.*), not proxied
                // through an image transform/optimization pipeline.
                <Image
                  src={route.destination_image_url}
                  alt=""
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-muted transition-colors group-hover:bg-muted/70" />
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 pb-4">
                <PlaneTakeoff className="mb-1 size-4 text-signal" />
                <p className="font-semibold text-white">
                  {route.destination_city_name ?? route.destination_iata_code}
                </p>
                <p className="font-mono text-[11px] tracking-widest text-white/70">
                  {route.destination_iata_code}
                </p>
              </div>
            </Link>
            {/* Unsplash's API guidelines require a visible "Photo by X
             * on Unsplash" credit, with both links utm-tagged, wherever
             * a photo is shown - not optional styling. */}
            {route.destination_image_url && route.destination_image_attribution_name && (
              <p className="absolute right-2 bottom-1 left-2 truncate font-mono text-[9px] text-white/60 opacity-0 transition-opacity group-hover:opacity-100">
                Photo by{" "}
                <a
                  href={route.destination_image_attribution_url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-white"
                >
                  {route.destination_image_attribution_name}
                </a>{" "}
                on{" "}
                <a
                  href={UNSPLASH_HOMEPAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-white"
                >
                  Unsplash
                </a>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
