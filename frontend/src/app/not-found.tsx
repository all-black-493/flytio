import Link from "next/link";

import TopNav from "@/components/TopNav";

/**
 * 404, for unmatched URLs and for any segment that calls notFound().
 *
 * The standard `not-found.tsx`, not the experimental `global-not-found`.
 * That one exists for apps that cannot compose a 404 from a layout -
 * several root layouts, or a dynamic top-level segment. This app has a
 * single root layout, so this file composes with it and keeps the theme,
 * fonts and providers without enabling an experimental flag and
 * hand-rolling `<html>`.
 *
 * TopNav is rendered explicitly because it lives in the (app) route
 * group's layout, not the root one - and an unmatched URL never enters
 * that group. Without it the 404 would be a dead end with no way back
 * into the site except the links below.
 *
 * Styled as a departures board with nothing on it, because the board is
 * already this product's visual idiom - a 404 is the one page a user
 * reaches by accident, and a generic one reads like a different site.
 */
export const metadata = {
  title: "Page not found | flyt",
  description: "That route doesn't exist.",
};

const SUGGESTIONS = [
  { label: "Search flights", href: "/", hint: "Live fares, price confirmed before payment" },
  { label: "My bookings", href: "/account", hint: "Tickets, receipts and cancellations" },
  { label: "flyt for business", href: "/business", hint: "Travel for teams" },
  { label: "Contact us", href: "/contact", hint: "We reply by email" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopNav />
      <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
        <div className="overflow-hidden rounded-2xl bg-board ring-1 ring-board-line">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
            <h1 className="font-mono text-xs tracking-[0.3em] text-board-ink">
              DEPARTURES — NO ROUTE FOUND
            </h1>
            <p className="font-mono text-[10px] tracking-[0.2em] text-board-muted">ERR 404</p>
          </div>

          <div className="border-t border-board-line px-4 py-10 text-center sm:px-6">
            <p className="font-heading text-6xl font-bold tracking-tight text-board-ink sm:text-8xl">
              404
            </p>
            <p className="mx-auto mt-3 max-w-md font-mono text-sm text-board-muted">
              This page isn&apos;t on the board. It may have been moved, or the link that
              brought you here may be out of date.
            </p>
          </div>

          <ul className="border-t border-board-line">
            {SUGGESTIONS.map((item) => (
              <li key={item.href} className="border-t border-board-line/60 first:border-t-0">
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-board-ink/5 sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm text-board-ink">{item.label}</span>
                    <span className="block truncate font-mono text-[11px] text-board-muted">
                      {item.hint}
                    </span>
                  </span>
                  <span aria-hidden className="font-mono text-signal">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
