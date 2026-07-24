/**
 * Presentation-only helpers for rendering Offer/Order data. No fetching, no
 * types declared here — see client.ts and types.ts respectively.
 */

import type { OfferSlice } from "./schemas";

/** "PT8H10M" -> "8h 10m" */
export function formatDuration(iso: string | null): string {
  if (!iso) return "";
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso);
  if (!match) return iso;
  const [, hours, minutes] = match;
  return [hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(" ");
}

/** "2026-08-14T17:05:00" -> "17:05" */
export function formatTime(isoDateTime: string): string {
  return isoDateTime.slice(11, 16);
}

/** "2026-08-14T17:05:00" -> "Fri, 14 Aug" */
export function formatShortDate(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function stopsLabel(slice: OfferSlice): string {
  const stops = slice.segments.length - 1;
  return stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`;
}

export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function routeLabel(slice: OfferSlice): string {
  const origin = slice.origin.iata_code ?? "?";
  const destination = slice.destination.iata_code ?? "?";
  return `${origin} → ${destination}`;
}
