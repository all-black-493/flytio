import Link from "next/link";

import FlightMap from "@/components/FlightMap";
import SearchCard from "@/components/SearchCard";

const PROOF_POINTS = ["300+ AIRLINES", "PRICE CONFIRMED BEFORE PAYMENT", "FARES REFRESH 60S"];

export default function Hero() {
  return (
    <section className="relative -mt-14 overflow-hidden">
      <FlightMap className="absolute inset-0" />
      {/* legibility scrim — only where the copy sits (left/top), so the
          route arcs stay visible across most of the canvas instead of
          being crushed under a full-bleed fade */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-background/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pt-24 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="mb-6 font-mono text-xs tracking-[0.25em] text-muted-foreground">
            FLYT — NORWEGIAN FOR FLOW
          </p>
          <h1 className="text-4xl font-bold leading-[0.95] tracking-tight text-balance sm:text-6xl">
            Booking a flight should feel like <span className="text-signal">flow</span>.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
            flyt searches hundreds of airlines, confirms the exact fare before
            you pay, and issues tickets in minutes — for one traveler or your
            whole company.
          </p>

          <ul className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
            {PROOF_POINTS.map((point) => (
              <li
                key={point}
                className="rounded-full border border-signal/25 bg-signal/8 px-3 py-1 font-mono text-[10px] tracking-[0.15em] text-foreground"
              >
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#board"
              className="rounded-full bg-signal px-6 py-3 font-semibold text-white transition-colors hover:bg-foreground hover:text-background"
            >
              See today&apos;s fares
            </a>
            <Link
              href="/#business"
              className="font-semibold text-muted-foreground hover:text-signal"
            >
              flyt for business →
            </Link>
          </div>
        </div>
        <SearchCard />
      </div>
    </section>
  );
}
