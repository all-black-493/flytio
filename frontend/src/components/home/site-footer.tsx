import Link from "next/link";

import { CookiePreferencesLink } from "@/components/analytics/cookie-preferences-link";
import { LogoMark } from "@/components/Logo";

export default function SiteFooter() {
  return (
    <footer className="bg-board text-board-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <span className="inline-flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-xl font-bold tracking-tight text-board-ink">flyt</span>
        </span>
        <nav className="flex items-center gap-4 font-mono text-xs tracking-widest text-board-muted">
          <Link href="/contact" className="hover:text-board-ink">
            CONTACT
          </Link>
          <Link href="/terms" className="hover:text-board-ink">
            TERMS
          </Link>
          <Link href="/privacy" className="hover:text-board-ink">
            PRIVACY
          </Link>
          <Link href="/cookies" className="hover:text-board-ink">
            COOKIES
          </Link>
          <CookiePreferencesLink />
        </nav>
        <p className="font-mono text-xs tracking-widest text-board-muted">
          © 2026 FLYT — BOOKING IN FLOW
        </p>
      </div>
    </footer>
  );
}
