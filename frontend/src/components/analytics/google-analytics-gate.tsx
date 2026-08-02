"use client";

import { GoogleAnalytics } from "@next/third-parties/google";

import { useCookieConsent } from "@/lib/analytics/cookie-consent";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/** Mounts Google Analytics only once the visitor has actually granted
 * consent - simpler than wiring up Google's full Consent Mode signals, and
 * meets the same bar (nothing analytics-related loads pre-consent) without
 * needing per-region default/update consent state juggling. */
export function GoogleAnalyticsGate() {
  const { status } = useCookieConsent();

  if (status !== "granted" || !GA_MEASUREMENT_ID) {
    return null;
  }

  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
