import Link from "next/link";

import SearchCard from "@/components/SearchCard";
import WorldMapBackground from "@/components/WorldMapBackground";

const PROOF_POINTS = ["ticket in ~47s", "no surprise fees"];

export default function Hero() {
  return (
    <section className="relative -mt-14 overflow-hidden border-b border-border">
      <WorldMapBackground className="absolute inset-0" />
      {/* legibility scrim — heaviest where the copy sits (left), so the map
          stays visible on the right behind the search console */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pt-24 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          {/* <p className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            // flyt — norwegian for flow
          </p> */}
          <h1 className="font-heading text-4xl font-bold leading-[0.92] tracking-tight text-balance sm:text-6xl">
            Every airline. One search.{" "}
            <span className="text-signal">The exact fare, locked before you pay.</span>
          </h1>
          <p className="mt-6 max-w-lg font-mono text-base leading-relaxed text-muted-foreground">
            flyt scans <span className="text-foreground">300+ carriers</span> and confirms
            the price before checkout - for one traveler or a whole company.
          </p>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[13px] lowercase text-muted-foreground">
            {PROOF_POINTS.map((point) => (
              <li key={point}>
                <span className="mr-1.5 text-signal">▸</span>
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#board"
              className="bg-signal px-6 py-3 font-mono text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-foreground hover:text-background active:translate-y-px"
            >
              See today&apos;s fares
            </a>
            <Link
              href="/business"
              className="font-mono text-sm lowercase text-muted-foreground hover:text-signal"
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
