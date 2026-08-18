export default function AudienceSplit() {
  return (
    <section id="business" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 pb-20 sm:px-6">
      <p className="mb-3 font-mono text-xs tracking-[0.25em] text-muted-foreground">
        TWO WAYS TO TRAVEL WITH US
      </p>
      <h2 className="mb-10 text-3xl font-bold tracking-tight sm:text-4xl">
        One seat, or the whole cabin.
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <article className="rounded-2xl border bg-card p-6 sm:p-8">
          <h3 className="mb-4 text-xl font-bold">For travelers</h3>
          <ul className="space-y-3 leading-relaxed text-muted-foreground">
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
        <article className="rounded-2xl bg-board p-6 text-board-ink sm:p-8">
          <h3 className="mb-4 text-xl font-bold">For travel businesses</h3>
          <ul className="space-y-3 leading-relaxed text-board-muted">
            <li>Book for teams and clients from one account.</li>
            <li>Consolidated payments and clean invoices.</li>
            <li>API access to the same search that powers flyt.</li>
          </ul>
          <a
            href="mailto:partners@flyt.africa"
            className="mt-6 inline-block font-semibold text-signal hover:text-board-ink"
          >
            Talk to us →
          </a>
        </article>
      </div>
    </section>
  );
}
