import Link from "next/link";

/**
 * The API page.
 *
 * A developer-facing page, not a marketing one: anyone who clicks "api" in
 * the nav wants the base URL, the auth model and the reference, and the
 * fastest useful page is the one that gives them those in that order.
 *
 * Everything stated here is checked against the running service rather
 * than aspirational. The reference links to the live OpenAPI document the
 * backend already serves, so it cannot drift from the implementation the
 * way a hand-written endpoint table would - there are 83 endpoints today
 * and no page maintained by hand would stay correct.
 *
 * Deliberately absent: rate-limit numbers, SLAs, and a self-service key
 * flow. Access is arranged directly today, and publishing a limit or a
 * guarantee the service has not committed to would be a promise made on
 * the product's behalf.
 */
export const metadata = {
  title: "flyt API | Build on our flight search",
  description:
    "The same live flight search, pricing and booking that powers flyt, available over a versioned HTTP API.",
};

const SURFACES = [
  {
    name: "Flights",
    detail: "Search live fares, confirm a price, and create a booking. The same calls the flyt web app makes.",
  },
  {
    name: "Stays",
    detail: "Accommodation search through to booking. Foundation endpoints - no persistence of your bookings on our side yet.",
  },
  {
    name: "Cars",
    detail: "Vehicle hire by pick-up location and period, quoted and reserved. Pick-up takes an airport code, so a hire composes with a flight.",
  },
];

export default function ApiPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">FLYT API</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
        The search that powers flyt, as an API.
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        Versioned HTTP and JSON. No SDK to install and no bespoke query language - if you can
        make an HTTPS request, you can use it.
      </p>

      {/* The three facts a developer opens this page for, before any prose. */}
      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <dt className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            BASE URL
          </dt>
          <dd className="mt-2 font-mono text-sm break-all">https://api.flyt.africa/api/v1</dd>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <dt className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">AUTH</dt>
          <dd className="mt-2 font-mono text-sm">Bearer token</dd>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <dt className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            FORMAT
          </dt>
          <dd className="mt-2 font-mono text-sm">JSON over HTTPS</dd>
        </div>
      </dl>

      <section className="mt-12">
        <h2 className="text-xl font-bold">What you can build against</h2>
        <ul className="mt-6 space-y-4">
          {SURFACES.map((surface) => (
            <li key={surface.name} className="rounded-2xl border bg-card p-6">
              <h3 className="font-mono text-sm tracking-[0.15em] text-signal uppercase">
                {surface.name}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{surface.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-2xl bg-board p-6 text-board-ink sm:p-8">
        <h2 className="text-xl font-bold">Reference</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-board-muted">
          The full reference is generated from the running service, so it always matches what
          is actually deployed - every endpoint, every field, every response shape.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <a
            href="https://api.flyt.africa/docs"
            target="_blank"
            rel="noreferrer"
            className="bg-signal px-6 py-3 font-mono text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-board-ink hover:text-board active:translate-y-px"
          >
            Open the reference
          </a>
          <a
            href="https://api.flyt.africa/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm text-board-muted hover:text-signal"
          >
            OpenAPI spec →
          </a>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-bold">Getting access</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          API credentials are issued directly rather than self-service. Tell us what
          you&apos;re building and we&apos;ll come back to you.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <a href="mailto:partners@flyt.africa" className="font-semibold text-signal hover:text-foreground">
            partners@flyt.africa →
          </a>
          <Link href="/business" className="font-mono text-sm text-muted-foreground hover:text-signal">
            flyt for business →
          </Link>
        </div>
      </section>
    </div>
  );
}
