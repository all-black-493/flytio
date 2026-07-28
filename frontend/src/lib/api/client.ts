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
  bookingPublicSchema,
  cardCheckoutResponseSchema,
  checkoutResponseSchema,
  flightSearchResponseSchema,
  healthResponseSchema,
  messageResponseSchema,
  offerResponseSchema,
  orderCancellationResponseSchema,
  orderChangeOffersResponseSchema,
  orderChangeRequestResponseSchema,
  orderChangeResponseSchema,
  orderResponseSchema,
  paymentStatusResponseSchema,
  placeSuggestionsResponseSchema,
  seatMapResponseSchema,
  tokenSchema,
  userReadSchema,
  type BookingListResponse,
  type BookingPublic,
  type CardCheckoutResponse,
  type CheckoutResponse,
  type FlightSearchResponse,
  type HealthResponse,
  type MessageResponse,
  type OfferResponse,
  type OrderCancellationResponse,
  type OrderChangeOffersResponse,
  type OrderChangeRequestResponse,
  type OrderChangeResponse,
  type OrderResponse,
  type PaymentStatusResponse,
  type PlaceSuggestionsResponse,
  type SeatMapResponse,
  type Token,
  type UserRead,
} from "./schemas";
import type {
  BookingListQueryParams,
  CheckoutRequest,
  ContactRequest,
  OfferListQueryParams,
  OfferPassengerUpdate,
  OfferPriceRequest,
  OfferRequestCreate,
  OrderChangeCreate,
  OrderChangeSlices,
  OrderCreate,
  PlaceSuggestionsQuery,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL!;

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

/** POST /api/forgot-password — always resolves the same way whether or
 * not the email is registered (the backend doesn't reveal which). */
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** POST /api/reset-password — token comes from the emailed reset link. */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** POST /api/change-password — self-service change for a signed-in user;
 * distinct from resetPassword, which proves identity via an emailed token
 * instead of the current password. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/change-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** DELETE /api/me — soft-deletes (anonymizes) the current user's own
 * account; booking/payment history is preserved. Requires the current
 * password, same reasoning as changePassword. */
export async function deleteAccount(password: string): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/me`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
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

/** PATCH /shopping/flight-offers/{offerId}/passengers/{offerPassengerId} —
 * attach loyalty programme accounts to a passenger on an already-priced
 * offer; returns the offer re-fetched (and re-marked-up), which may
 * reflect a loyalty discount. */
export async function updateOfferPassengerLoyalty(
  offerId: string,
  offerPassengerId: string,
  request: OfferPassengerUpdate,
): Promise<OfferResponse> {
  const res = await fetch(
    `${API_URL}/shopping/flight-offers/${offerId}/passengers/${offerPassengerId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
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

/* ---------- payment: mirrors backend/routers/payments.py (auth required) ---------- */

/** POST /payments/checkout — starts a purchase and returns a Pesapal
 * redirect URL. No payment info in the request; Pesapal collects that. */
export async function checkout(request: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await fetch(`${API_URL}/payments/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return checkoutResponseSchema.parse(await res.json());
}

/** GET /payments/{paymentId}/status — polled after the Pesapal redirect. */
export async function getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
  const res = await fetch(`${API_URL}/payments/${paymentId}/status`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return paymentStatusResponseSchema.parse(await res.json());
}

/** POST /payments/checkout/card — Duffel Payments alternative to
 * checkout() above: returns a client_token for <DuffelPayments />
 * instead of a Pesapal redirect_url. */
export async function checkoutWithCard(
  request: CheckoutRequest,
): Promise<CardCheckoutResponse> {
  const res = await fetch(`${API_URL}/payments/checkout/card`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return cardCheckoutResponseSchema.parse(await res.json());
}

/** POST /payments/{paymentId}/confirm-card — called once <DuffelPayments />
 * reports a successful card collection. Same response shape as
 * getPaymentStatus, so callers can reuse the same result UI. */
export async function confirmCardPayment(paymentId: string): Promise<PaymentStatusResponse> {
  const res = await fetch(`${API_URL}/payments/${paymentId}/confirm-card`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return paymentStatusResponseSchema.parse(await res.json());
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

/** GET /booking/flight-orders/by-id/{bookingId} — our own booking record
 * (not Duffel's order_id, see getOrder below) — includes ticket numbers. */
export async function getBookingById(bookingId: string): Promise<BookingPublic> {
  const res = await fetch(`${API_URL}/booking/flight-orders/by-id/${bookingId}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return bookingPublicSchema.parse(await res.json());
}

/** GET /booking/flight-orders/by-ticket/{ticketNumber} — find one of the
 * current user's bookings from an airline-issued ticket number alone. */
export async function getBookingByTicketNumber(ticketNumber: string): Promise<BookingPublic> {
  const res = await fetch(`${API_URL}/booking/flight-orders/by-ticket/${ticketNumber}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return bookingPublicSchema.parse(await res.json());
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

/** POST .../change-requests — step 1 of changing an order: describe which
 * slice to remove and what new slice to search for in its place. */
export async function createOrderChangeRequest(
  orderId: string,
  request: OrderChangeSlices,
): Promise<OrderChangeRequestResponse> {
  const res = await fetch(`${API_URL}/booking/flight-orders/${orderId}/change-requests`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderChangeRequestResponseSchema.parse(await res.json());
}

/** GET .../change-requests/{id}/offers — step 2: the priced ways to
 * satisfy a change request. */
export async function listOrderChangeOffers(
  orderId: string,
  orderChangeRequestId: string,
): Promise<OrderChangeOffersResponse> {
  const res = await fetch(
    `${API_URL}/booking/flight-orders/${orderId}/change-requests/${orderChangeRequestId}/offers`,
    { credentials: "include", headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderChangeOffersResponseSchema.parse(await res.json());
}

/** POST .../changes — step 3: create a pending change from a chosen
 * offer. Not confirmed/charged yet - see backend/routers/bookings.py. */
export async function createOrderChange(
  orderId: string,
  request: OrderChangeCreate,
): Promise<OrderChangeResponse> {
  const res = await fetch(`${API_URL}/booking/flight-orders/${orderId}/changes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderChangeResponseSchema.parse(await res.json());
}

/* ---------- support: POST /support/contact ---------- */

/** No auth required - a customer who can't log in is exactly who most
 * needs this. */
export async function contactSupport(request: ContactRequest): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/support/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** GET /health — used by the navbar's status ticker. No credentials/auth
 * needed; a real DB round trip on the backend (see backend/main.py). */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return healthResponseSchema.parse(await res.json());
}
