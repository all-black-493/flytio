"use client";

import { useCookieConsent } from "@/lib/analytics/cookie-consent";

/** Lets a visitor who already made a cookie choice change their mind,
 * without hunting for browser settings - reopens the same banner. */
export function CookiePreferencesLink() {
  const { reopen } = useCookieConsent();

  return (
    <button type="button" onClick={reopen} className="hover:text-board-ink">
      COOKIE PREFERENCES
    </button>
  );
}
