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

/** "best" trades price against duration and stops - see the backend's
 * _best_value_scores. The cheapest fare on a route is routinely a
 * multi-stop itinerary hours longer than the direct one. */
export type OfferSortKey = "best" | "price" | "duration" | "departure" | "arrival";

/** Local departure time of the outbound leg. */
export type DepartureWindow = "morning" | "afternoon" | "evening" | "night";

/** View-layer params applied to an already-fetched, cached offer list —
 * kept separate from OfferRequestCreate (the shopping request itself), so
 * changing a filter/sort/page doesn't change what the backend caches. */
export interface OfferListQueryParams {
  sort?: OfferSortKey;
  depart_windows?: DepartureWindow[];
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

/* ---------- loyalty: PATCH /shopping/flight-offers/{id}/passengers/{id} ---------- */

export interface LoyaltyProgrammeAccount {
  airline_iata_code: string;
  account_number: string;
}

export interface OfferPassengerUpdate {
  given_name: string;
  family_name: string;
  loyalty_programme_accounts: LoyaltyProgrammeAccount[];
}

/* ---------- places: GET /shopping/places ---------- */

export interface PlaceSuggestionsQuery {
  query?: string;
  lat?: number;
  lng?: number;
  rad?: number;
}

/* ---------- booking: POST /booking/flight-orders ---------- */

export interface IdentityDocument {
  unique_identifier: string;
  type: string;
  issuing_country_code: string;
  expires_on: string;
}

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
  /** Required when the offer's passenger_identity_documents_required is
   * true - see Offer.passenger_identity_documents_required. */
  identity_documents?: IdentityDocument[] | null;
  /** Seat picked in our own seat-map UI, for display only - the backend
   * strips this before sending the order to Duffel. */
  seat_designator?: string | null;
  /** The seat's available_services[].id (ase_...) for this passenger, from
   * GET /shopping/seatmaps - this is what actually reserves the seat with
   * the airline. The backend re-prices it from Duffel's own seat map at
   * checkout time rather than trusting this value's cost. */
  seat_service_id?: string | null;
  /** Purchasable-baggage available_services[].id entries picked for this
   * passenger (Offer.available_services, type "baggage") - same
   * server-side re-pricing treatment as seat_service_id. */
  extra_baggage_service_ids?: string[];
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
  /** Validated and applied server-side - never trust a client-computed
   * discounted amount for what's actually charged. */
  discount_code?: string | null;
}

/* ---------- discounts: POST /discounts/preview ---------- */

export interface DiscountPreviewRequest {
  offer_id: string;
  discount_code: string;
}

/** The query params every cursor-paginated list endpoint accepts
 * (fastapi-pagination's CursorParams). `cursor` is the opaque
 * `next_page` value from the previous page; omit it for the first page. */
export interface CursorPageQueryParams {
  cursor?: string | null;
  size?: number;
}

/** Cursor pagination (cursor/size), not offset — see
 * CursorPageQueryParams. An absent cursor means "the first page". */
export interface BookingListQueryParams extends CursorPageQueryParams {
  booking_reference?: string;
  origin?: string;
  destination?: string;
  status?: BookingStatus;
}

/* ---------- admin: mirrors backend/routers/admin.py ---------- */

export interface AdminListQueryParams extends CursorPageQueryParams {
  search?: string;
}

/** POST /api/admin/bookings - CheckoutRequest plus which existing
 * customer this booking belongs to. No payment fields - see
 * backend/crud/payments.py's create_admin_booking for what
 * "admin-marked-paid" means. */
export interface AdminCreateBookingRequest extends CheckoutRequest {
  user_id: string;
}

/* ---------- pricing: POST/DELETE /api/admin/pricing/... ---------- */

export interface CreatePricingSaleRequest {
  name: string;
  markup_rate: number;
  starts_at: string;
  ends_at: string;
}

export interface CreateDiscountCodeRequest {
  code: string;
  discount_percentage: number;
  max_redemptions?: number | null;
  expires_at?: string | null;
}

/* ---------- order changes: POST .../change-requests, .../changes ---------- */

export interface OrderChangeSliceRemove {
  slice_id: string;
}

export interface OrderChangeSliceAdd {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class?: string;
}

export interface OrderChangeSlices {
  remove: OrderChangeSliceRemove[];
  add: OrderChangeSliceAdd[];
}

export interface OrderChangeCreate {
  selected_order_change_offer: string;
}

/* ---------- support: POST /support/contact ---------- */

export interface ContactRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
  booking_reference?: string;
}
