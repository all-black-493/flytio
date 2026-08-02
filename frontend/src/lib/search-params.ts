/**
 * Pure logic for the /search route's URL contract: parsing incoming search
 * params into a typed shape, turning that shape into a backend
 * OfferRequestCreate body, and building /search?... URLs for links and
 * form submits. Shared by the /search route and the home page search card.
 * No React, no fetching.
 */

import type { CabinClass } from "@/lib/api/schemas";
import type { OfferRequestCreate, SearchPassenger } from "@/lib/api/types";

export interface SearchParams {
  origin?: string;
  destination?: string;
  departure_date?: string;
  return_date?: string;
  adults?: string;
  children?: string;
  infants?: string;
  cabin_class?: string;
}

export interface ParsedSearch {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  adults: number;
  children: number;
  infants: number;
  cabinClass: CabinClass | null;
}

const CABIN_CLASSES: CabinClass[] = ["first", "business", "premium_economy", "economy"];

/** Next.js delivers searchParams values as string | string[] | undefined;
 * collapse to the single-string shape parseSearchParams (and other
 * per-feature parsers, e.g. search/_lib/pagination-params.ts) expect. The
 * return type is intentionally the general Record, not SearchParams: this
 * flattens every param in the URL, not just the ones parseSearchParams
 * itself reads, so other parsers can share one flatten call. */
export function flattenSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") flat[key] = value;
  }
  return flat;
}

/** Returns null if the required fields (origin/destination/departure date)
 * are missing, so the page can show a "start a search" prompt instead. */
export function parseSearchParams(params: Record<string, string>): ParsedSearch | null {
  if (!params.origin || !params.destination || !params.departure_date) return null;
  const cabinClass = CABIN_CLASSES.find((c) => c === params.cabin_class) ?? null;
  return {
    origin: params.origin.toUpperCase(),
    destination: params.destination.toUpperCase(),
    departureDate: params.departure_date,
    returnDate: params.return_date || null,
    adults: Math.max(1, Number(params.adults) || 1),
    children: Math.max(0, Number(params.children) || 0),
    infants: Math.max(0, Number(params.infants) || 0),
    cabinClass,
  };
}

export function toOfferRequest(search: ParsedSearch): OfferRequestCreate {
  const slices = [
    { origin: search.origin, destination: search.destination, departure_date: search.departureDate },
  ];
  if (search.returnDate) {
    slices.push({
      origin: search.destination,
      destination: search.origin,
      departure_date: search.returnDate,
    });
  }

  const passengers: SearchPassenger[] = [
    ...Array.from({ length: search.adults }, (): SearchPassenger => ({ type: "adult" })),
    ...Array.from({ length: search.children }, (): SearchPassenger => ({ type: "child" })),
    ...Array.from({ length: search.infants }, (): SearchPassenger => ({ type: "infant_without_seat" })),
  ];

  return {
    slices,
    passengers,
    cabin_class: search.cabinClass,
  };
}

/** "OSL — Oslo" or bare "osl" -> "OSL" */
export function extractIataCode(value: string): string {
  return value.trim().slice(0, 3).toUpperCase();
}

/** Builds the /search?... query string for a new search. */
export function toSearchQueryString(input: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children?: number;
  infants?: number;
  cabinClass?: CabinClass;
}): string {
  const params = new URLSearchParams({
    origin: input.origin,
    destination: input.destination,
    departure_date: input.departureDate,
  });
  if (input.returnDate) params.set("return_date", input.returnDate);
  params.set("adults", String(input.adults));
  if (input.children) params.set("children", String(input.children));
  if (input.infants) params.set("infants", String(input.infants));
  if (input.cabinClass) params.set("cabin_class", input.cabinClass);
  return params.toString();
}

/** Reads the shared search-form fields (origin/destination text inputs plus
 * departure_date, return_date, cabin_class, adults form fields) and builds
 * the /search URL both the home search card and results search bar push to. */
export function searchHrefFromForm(
  form: FormData,
  origin: string,
  destination: string,
): string {
  const query = toSearchQueryString({
    origin: extractIataCode(origin),
    destination: extractIataCode(destination),
    departureDate: String(form.get("departure_date")),
    returnDate: String(form.get("return_date") || "") || undefined,
    adults: Number(form.get("adults")) || 1,
    children: Number(form.get("children")) || undefined,
    infants: Number(form.get("infants")) || undefined,
    cabinClass: (String(form.get("cabin_class")) as CabinClass) || undefined,
  });
  return `/search?${query}`;
}
