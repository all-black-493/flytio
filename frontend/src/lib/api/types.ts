/**
 * Plain TypeScript types for requests we construct ourselves and send to
 * the backend. These aren't zod schemas: we build them from our own
 * already-validated state (form inputs, filter state), not from untrusted
 * external data, so compile-time typing is enough — see schemas.ts for the
 * response-boundary types, which ARE runtime-validated.
 */

import type { BookingStatus, CabinClass, PassengerType } from "./schemas";

/* ---------- search: POST/GET /shopping/flight-offers ---------- */

export interface SlicePlan {
  origin: string;
  destination: string;
  departure_date: string; // YYYY-MM-DD
}

export interface SearchPassenger {
  type?: PassengerType | null;
  age?: number | null;
}

export interface OfferRequestCreate {
  slices: SlicePlan[];
  passengers: SearchPassenger[];
  cabin_class?: CabinClass | null;
  max_connections?: number | null;
}

export interface FlightSearchQueryParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  adults?: number;
  children?: number;
  infants?: number;
  cabin_class?: CabinClass;
  max_connections?: number;
}

export type OfferSortKey = "price" | "duration" | "departure" | "arrival";

/** View-layer params applied to an already-fetched, cached offer list —
 * kept separate from OfferRequestCreate (the shopping request itself), so
 * changing a filter/sort/page doesn't change what the backend caches. */
export interface OfferListQueryParams {
  sort?: OfferSortKey;
  airlines?: string[];
  max_stops?: number | null;
  price_max?: number | null;
  limit?: number;
  offset?: number;
}

/* ---------- pricing: POST /shopping/flight-offers/pricing ---------- */

export interface OfferPriceRequest {
  offer_id: string;
}

/* ---------- places: GET /shopping/places ---------- */

export interface PlaceSuggestionsQuery {
  query?: string;
  lat?: number;
  lng?: number;
  rad?: number;
}

/* ---------- booking: POST /booking/flight-orders ---------- */

export interface OrderPassenger {
  id: string;
  title: string;
  gender: string;
  given_name: string;
  family_name: string;
  born_on: string;
  email: string;
  phone_number: string;
  infant_passenger_id?: string | null;
  /** Seat picked in our own seat-map UI. Recorded on our booking record
   * only - the backend strips this before sending the order to Duffel. */
  seat_designator?: string | null;
}

export interface OrderPayment {
  type: "balance" | "arc_bsp_cash";
  currency: string;
  amount: string;
}

export interface OrderCreate {
  selected_offers: [string];
  passengers: OrderPassenger[];
  payments: OrderPayment[];
}

/* ---------- payment: POST /payments/checkout ---------- */

/** Same passengers/offer as OrderCreate, deliberately no `payments` field -
 * the customer pays via Pesapal, not a client-supplied balance charge. */
export interface CheckoutRequest {
  selected_offers: [string];
  passengers: OrderPassenger[];
}

export interface BookingListQueryParams {
  booking_reference?: string;
  origin?: string;
  destination?: string;
  status?: BookingStatus;
  limit?: number;
  offset?: number;
}
