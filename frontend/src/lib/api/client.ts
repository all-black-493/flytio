/**
 * Fetch functions only — no schema/type declarations (see schemas.ts and
 * types.ts) and no formatting/display logic (see format.ts). Safe to call
 * from Server Components (SSR) as well as Client Components.
 *
 * Auth is an httpOnly cookie set by the backend, not something this file
 * manages directly. Browser calls send it automatically via
 * `credentials: "include"`. Server Components run on the Next.js server,
 * which never sees the browser's cookie jar for a *different* origin (the
 * FastAPI backend) — so on the server we read the same cookie via
 * `next/headers` and forward it as a Bearer header instead, reusing the
 * backend's existing Authorization-header code path.
 *
 * Every response is parsed through its zod schema before being returned,
 * so a backend contract change fails loudly here instead of surfacing as
 * `undefined` deep in a component.
 */

import {
  bookingListResponseSchema,
  flightSearchResponseSchema,
  offerResponseSchema,
  orderCancellationResponseSchema,
  orderResponseSchema,
  placeSuggestionsResponseSchema,
  seatMapResponseSchema,
  tokenSchema,
  userReadSchema,
  type BookingListResponse,
  type FlightSearchResponse,
  type OfferResponse,
  type OrderCancellationResponse,
  type OrderResponse,
  type PlaceSuggestionsResponse,
  type SeatMapResponse,
  type Token,
  type UserRead,
} from "./schemas";
import type {
  BookingListQueryParams,
  OfferListQueryParams,
  OfferPriceRequest,
  OfferRequestCreate,
  OrderCreate,
  PlaceSuggestionsQuery,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Must match backend/utils/security.py's COOKIE_NAME. */
const AUTH_COOKIE_NAME = "flyt_token";

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return JSON.stringify(body.detail);
  } catch {
    /* non-JSON error body */
  }
  return `Request failed (${res.status})`;
}

async function authHeaders(): Promise<HeadersInit> {
  if (typeof window !== "undefined") return {};
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ---------- auth: mirrors backend/routers/users.py ---------- */

/** POST /api/register/ — create an account. */
export async function registerUser(email: string, password: string): Promise<UserRead> {
  const res = await fetch(`${API_URL}/api/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return userReadSchema.parse(await res.json());
}

/** POST /api/token — OAuth2 password flow; backend sets the auth cookie. */
export async function loginUser(email: string, password: string): Promise<Token> {
  const body = new URLSearchParams({ grant_type: "password", username: email, password });
  const res = await fetch(`${API_URL}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    credentials: "include",
    body,
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return tokenSchema.parse(await res.json());
}

/** POST /api/logout — clears the auth cookie server-side. */
export async function logoutUser(): Promise<void> {
  const res = await fetch(`${API_URL}/api/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await errorDetail(res));
}

/** GET /api/me — the signed-in user's own account. */
export async function getCurrentUser(): Promise<UserRead> {
  const res = await fetch(`${API_URL}/api/me`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return userReadSchema.parse(await res.json());
}

/* ---------- shopping: mirrors backend/routers/flights.py ---------- */

/** Repeats `airlines` as multiple query params (FastAPI's default for
 * list[str] query params), unlike the plain filter().map() pattern used
 * for the flat, scalar-only query builders below. */
function offerListSearchParams(params: OfferListQueryParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.sort) search.set("sort", params.sort);
  for (const code of params.airlines ?? []) search.append("airlines", code);
  if (params.max_stops != null) search.set("max_stops", String(params.max_stops));
  if (params.price_max != null) search.set("price_max", String(params.price_max));
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  return search;
}

/**
 * POST /shopping/flight-offers — create an offer request and get one page
 * of its (filtered, sorted, grouped) offers back. Safe to call from a
 * Server Component: this endpoint doesn't require an auth header.
 */
export async function searchOffers(
  request: OfferRequestCreate,
  params: OfferListQueryParams = {},
): Promise<FlightSearchResponse> {
  const res = await fetch(`${API_URL}/shopping/flight-offers?${offerListSearchParams(params)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return flightSearchResponseSchema.parse(await res.json());
}

/** POST /shopping/flight-offers/pricing — confirm an offer's live price. */
export async function confirmOfferPrice(request: OfferPriceRequest): Promise<OfferResponse> {
  const res = await fetch(`${API_URL}/shopping/flight-offers/pricing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return offerResponseSchema.parse(await res.json());
}

/** GET /shopping/seatmaps?offer_id=... */
export async function getSeatMap(offerId: string): Promise<SeatMapResponse> {
  const res = await fetch(
    `${API_URL}/shopping/seatmaps?${new URLSearchParams({ offer_id: offerId })}`,
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return seatMapResponseSchema.parse(await res.json());
}

/** GET /shopping/places — airport/city autocomplete or geo-radius search. */
export async function searchPlaces(
  query: PlaceSuggestionsQuery,
): Promise<PlaceSuggestionsResponse> {
  const params = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const res = await fetch(`${API_URL}/shopping/places?${params}`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return placeSuggestionsResponseSchema.parse(await res.json());
}

/* ---------- booking: mirrors backend/routers/flights.py (auth required) ---------- */

/** POST /booking/flight-orders — book a priced offer. */
export async function createOrder(request: OrderCreate): Promise<OrderResponse> {
  const res = await fetch(`${API_URL}/booking/flight-orders`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderResponseSchema.parse(await res.json());
}

/** GET /booking/flight-orders — the current user's own bookings, one page. */
export async function listBookings(
  params: BookingListQueryParams = {},
): Promise<BookingListResponse> {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const res = await fetch(`${API_URL}/booking/flight-orders?${search}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return bookingListResponseSchema.parse(await res.json());
}

/** GET /booking/flight-orders/{orderId} — live order detail. */
export async function getOrder(orderId: string): Promise<OrderResponse> {
  const res = await fetch(`${API_URL}/booking/flight-orders/${orderId}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderResponseSchema.parse(await res.json());
}

/** POST /booking/flight-orders/{orderId}/cancellations — get a refund quote. */
export async function requestCancellation(orderId: string): Promise<OrderCancellationResponse> {
  const res = await fetch(`${API_URL}/booking/flight-orders/${orderId}/cancellations`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderCancellationResponseSchema.parse(await res.json());
}

/** POST .../cancellations/{cancellationId}/confirm — finalize the cancellation. */
export async function confirmCancellation(
  orderId: string,
  cancellationId: string,
): Promise<OrderCancellationResponse> {
  const res = await fetch(
    `${API_URL}/booking/flight-orders/${orderId}/cancellations/${cancellationId}/confirm`,
    { method: "POST", credentials: "include", headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderCancellationResponseSchema.parse(await res.json());
}
