import DepartureBoard from "@/components/DepartureBoard";
import FlightMap from "@/components/FlightMap";
import SearchCard from "@/components/SearchCard";
import { LogoMark } from "@/components/Logo";
import { sampleResponse } from "@/lib/flights";

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <main className="flex-1">
        {/* Hero over the live flight map */}
        <section className="relative -mt-14 overflow-hidden">
          <FlightMap className="absolute inset-0" />
          {/* legibility scrim — lets the map breathe at the edges */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/55 to-background pointer-events-none" />
          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 pt-24 pb-14 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground mb-6">
                FLYT — NORWEGIAN FOR FLOW
              </p>
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[0.95] text-balance">
                Booking a flight should feel like{" "}
                <span className="text-signal">flow</span>.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                flyt searches hundreds of airlines, confirms the exact fare
                before you pay, and issues tickets in minutes — for one
                traveler or your whole company.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="#board"
                  className="rounded-full bg-signal px-6 py-3 font-semibold text-white hover:bg-foreground hover:text-background transition-colors"
                >
                  See today&apos;s fares
                </a>
                <a
                  href="#business"
                  className="font-semibold text-muted-foreground hover:text-signal"
                >
                  flyt for business →
                </a>
              </div>
            </div>
            <SearchCard />
          </div>
        </section>

        {/* Signature: the departures board */}
        <section
          id="board"
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-16 scroll-mt-6"
        >
          <DepartureBoard
            offers={sampleResponse.data}
            dictionaries={sampleResponse.dictionaries}
          />
        </section>

        {/* B2C / B2B */}
        <section
          id="business"
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-20 scroll-mt-8"
        >
          <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground mb-3">
            TWO WAYS TO FLY WITH US
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            One seat, or the whole cabin.
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border bg-card p-6 sm:p-8">
              <h3 className="text-xl font-bold mb-4">For travelers</h3>
              <ul className="space-y-3 text-muted-foreground leading-relaxed">
                <li>Live fares from hundreds of airlines, in one search.</li>
                <li>Confirm the exact price before you pay — no surprises.</li>
                <li>E-tickets and confirmations straight to your inbox.</li>
              </ul>
              <a
                href="#search"
                className="mt-6 inline-block font-semibold text-signal hover:text-foreground"
              >
                Start a search →
              </a>
            </article>
            <article className="rounded-2xl bg-board p-6 sm:p-8 text-board-ink">
              <h3 className="text-xl font-bold mb-4">For travel businesses</h3>
              <ul className="space-y-3 text-board-muted leading-relaxed">
                <li>Book for teams and clients from one account.</li>
                <li>Consolidated payments and clean invoices.</li>
                <li>API access to the same search that powers flyt.io.</li>
              </ul>
              <a
                href="mailto:partners@flyt.io"
                className="mt-6 inline-block font-semibold text-signal hover:text-board-ink"
              >
                Talk to us →
              </a>
            </article>
          </div>
        </section>
      </main>

      <footer className="bg-board text-board-ink">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <span className="inline-flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-xl font-bold tracking-tight text-board-ink">
              flyt<span className="text-signal">.</span>
              <span className="text-board-muted">io</span>
            </span>
          </span>
          <p className="font-mono text-xs tracking-widest text-board-muted">
            © 2026 FLYT.IO — BOOKING IN FLOW
          </p>
        </div>
      </footer>
    </div>
  );
}
