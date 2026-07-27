"use client";

import { useSyncExternalStore } from "react";

type ConsentStatus = "unknown" | "granted" | "denied";

const STORAGE_KEY = "flyt_cookie_consent";

// Backed by localStorage (the real source of truth) via useSyncExternalStore,
// not React state + an effect - the earlier version's "read on mount" effect
// triggered the same setState-in-effect cascading-render lint error this
// codebase already fixed once before. This also gives every consumer
// (banner, GA gate, footer link) automatic re-renders when any one of them
// calls grant/deny/reopen, with no Context/Provider needed.
const listeners = new Set<() => void>();

function readStatus(): ConsentStatus {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "granted" || stored === "denied" ? stored : "unknown";
}

function writeStatus(next: ConsentStatus | null) {
  if (next === null) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// "unknown" on the server and on first client render, before hydration can
// read localStorage - avoids a hydration mismatch.
function getServerSnapshot(): ConsentStatus {
  return "unknown";
}

export function useCookieConsent() {
  const status = useSyncExternalStore(subscribe, readStatus, getServerSnapshot);

  return {
    status,
    grant: () => writeStatus("granted"),
    deny: () => writeStatus("denied"),
    /** Re-opens the banner so a visitor can change an earlier choice -
     * GDPR/PECR expect withdrawing consent to be as easy as giving it. */
    reopen: () => writeStatus(null),
  };
}
