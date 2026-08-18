import Link from "next/link";

/**
 * flyt for business.
 *
 * Every claim here is one the product can already stand behind - the
 * homepage's "For travel businesses" panel said the same three things, and
 * this page is where that anchor now resolves rather than jumping to a
 * section. Deliberately no pricing, no client logos, no volume tiers and
 * no SLA: those are commercial commitments, and a marketing page that
 * invents them writes cheques the product has to honour.
 *
 * The gap that remains is a real one - team accounts and consolidated
 * invoicing are described as what to talk to us about, not as
 * self-service features, because that is the truth today.
 */
export const metadata = {
  title: "flyt for business | Travel for teams",
  description:
    "Book flights for teams and clients from one account, with the exact fare confirmed before payment.",
};

const CAPABILITIES = [
  {
    title: "One account, many travellers",
    body: "Book for colleagues and clients without a separate profile for each trip. Every booking, ticket and receipt stays in one place.",
  },
  {
    title: "The price you were quoted",
    body: "Fares are re-confirmed with the airline before payment is taken. If the fare moved, you see the new one before you commit - not on the invoice.",
  },
  {
    title: "Tickets and receipts, automatically",
    body: "E-tickets with a QR code, a PDF for the file, and a receipt that reconciles - issued the moment a booking is confirmed.",
  },
  {
    title: "Changes and cancellations",
    body: "Refund and change conditions are shown with the fare, so the person booking knows what a plan change will cost before they choose it.",
  },
];

export default function BusinessPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground">
        FLYT FOR BUSINESS
      </p>
      <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
        Book the whole cabin, not one seat at a time.
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        The same live fares and the same price-confirmed-before-payment guarantee that
        travellers get, organised for the person who books on everyone else&apos;s behalf.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {CAPABILITIES.map((item) => (
          <article key={item.title} className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-bold">{item.title}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </div>

      {/* Honest about what is not self-service yet. A business page that
          implies a signup flow which does not exist costs more trust than
          it wins. */}
      <section className="mt-12 rounded-2xl bg-board p-6 text-board-ink sm:p-8">
        <h2 className="text-xl font-bold">Team accounts and consolidated invoicing</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-board-muted">
          Set up per-team billing, agreed payment terms and a single monthly invoice by
          talking to us - these are arranged directly rather than self-service. Tell us how
          your team travels and we&apos;ll tell you plainly whether we can help.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <a
            href="mailto:partners@flyt.africa"
            className="bg-signal px-6 py-3 font-mono text-sm font-semibold uppercase tracking-widest text-black transition-colors hover:bg-board-ink hover:text-board active:translate-y-px"
          >
            Talk to us
          </a>
          <Link href="/api" className="font-mono text-sm text-board-muted hover:text-signal">
            Or build on the API →
          </Link>
        </div>
      </section>
    </div>
  );
}
