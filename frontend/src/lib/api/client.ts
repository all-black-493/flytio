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
  adminBookingListResponseSchema,
  adminBookingReadSchema,
  adminDashboardSummarySchema,
  adminGroupReadSchema,
  adminPermissionReadSchema,
  adminUserDetailSchema,
  adminUserListResponseSchema,
  adminUserReadSchema,
  bookingListResponseSchema,
  bookingPublicSchema,
  cardCheckoutResponseSchema,
  checkoutResponseSchema,
  discountCodeReadSchema,
  customerRefundSchema,
  discountPreviewResponseSchema,
  flightSearchResponseSchema,
  healthResponseSchema,
  messageResponseSchema,
  notificationListResponseSchema,
  notificationReadSchema,
  offerResponseSchema,
  orderCancellationQuoteResponseSchema,
  orderCancellationResponseSchema,
  orderChangeOffersResponseSchema,
  orderChangeRequestResponseSchema,
  orderChangeResponseSchema,
  orderResponseSchema,
  paymentStatusResponseSchema,
  placeSuggestionsResponseSchema,
  popularRouteListSchema,
  pricingSaleReadSchema,
  refundListSchema,
  refundReadSchema,
  seatMapResponseSchema,
  tokenSchema,
  unreadCountResponseSchema,
  userReadSchema,
  type AdminBookingListResponse,
  type AdminBookingRead,
  type AdminDashboardSummary,
  type AdminGroupRead,
  type AdminPermissionRead,
  type AdminUserDetail,
  type AdminUserListResponse,
  type AdminUserRead,
  type BookingListResponse,
  type BookingPublic,
  type CardCheckoutResponse,
  type CheckoutResponse,
  type DiscountCodeRead,
  type CustomerRefund,
  type DiscountPreviewResponse,
  type FlightSearchResponse,
  type HealthResponse,
  type MessageResponse,
  type NotificationListResponse,
  type NotificationRead,
  type OfferResponse,
  type OrderCancellationQuoteResponse,
  type OrderCancellationResponse,
  type OrderChangeOffersResponse,
  type OrderChangeRequestResponse,
  type OrderChangeResponse,
  type OrderResponse,
  type PaymentStatusResponse,
  type PlaceSuggestionsResponse,
  type PopularRoute,
  type PricingSaleRead,
  type RefundRead,
  type RefundStatus,
  type SeatMapResponse,
  type Token,
  type UnreadCountResponse,
  type UserRead,
} from "./schemas";
import type {
  AdminCreateBookingRequest,
  AdminListQueryParams,
  BookingListQueryParams,
  CheckoutRequest,
  ContactRequest,
  CreateDiscountCodeRequest,
  CreatePricingSaleRequest,
  DiscountPreviewRequest,
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

/** GET /flights/popular-destinations — public, no auth. Empty array is a
 * normal response (the route hasn't cleared the real-bookings threshold
 * yet), not an error. */
export async function getPopularDestinations(limit?: number): Promise<PopularRoute[]> {
  const params = limit !== undefined ? `?limit=${limit}` : "";
  const res = await fetch(`${API_URL}/flights/popular-destinations${params}`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return popularRouteListSchema.parse(await res.json());
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

/** POST /discounts/preview — non-persisting check of whether a discount
 * code is valid and roughly what it saves, shown before checkout. The
 * real checkout() call re-validates and applies the code against the
 * final total, which is what's authoritative. */
export async function previewDiscount(
  request: DiscountPreviewRequest,
): Promise<DiscountPreviewResponse> {
  const res = await fetch(`${API_URL}/payments/discounts/preview`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return discountPreviewResponseSchema.parse(await res.json());
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

/** POST /booking/flight-orders/{orderId}/cancellations — get a refund quote.
 * Returns Duffel's quote plus `customer_refund`, which is what the person
 * actually gets back; always quote that one to a customer. */
export async function requestCancellation(
  orderId: string,
): Promise<OrderCancellationQuoteResponse> {
  const res = await fetch(`${API_URL}/booking/flight-orders/${orderId}/cancellations`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return orderCancellationQuoteResponseSchema.parse(await res.json());
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

/* ---------- admin: mirrors backend/routers/admin.py — every call here
 * requires is_staff (and, for some, is_superuser) on the backend; the
 * frontend's own gating (staff nav link, /admin layout redirect) is a UX
 * convenience, not the real enforcement. ---------- */

/** GET /api/admin/dashboard/summary */
export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const res = await fetch(`${API_URL}/api/admin/dashboard/summary`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminDashboardSummarySchema.parse(await res.json());
}

/** GET /api/admin/dashboard/popular-routes */
export async function getAdminPopularRoutes(limit?: number): Promise<PopularRoute[]> {
  const params = limit !== undefined ? `?limit=${limit}` : "";
  const res = await fetch(`${API_URL}/api/admin/dashboard/popular-routes${params}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return popularRouteListSchema.parse(await res.json());
}

/** GET /api/admin/bookings — every booking in the system, not just the
 * caller's own (see listBookings above for the customer-scoped version). */
export async function listAdminBookings(
  params: AdminListQueryParams = {},
): Promise<AdminBookingListResponse> {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const res = await fetch(`${API_URL}/api/admin/bookings?${search}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminBookingListResponseSchema.parse(await res.json());
}

/** GET /api/admin/users */
export async function listAdminUsers(
  params: AdminListQueryParams = {},
): Promise<AdminUserListResponse> {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const res = await fetch(`${API_URL}/api/admin/users?${search}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminUserListResponseSchema.parse(await res.json());
}

/** GET /api/admin/users/{userId}/bookings */
export async function getAdminUserBookings(
  userId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<BookingListResponse> {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/bookings?${search}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return bookingListResponseSchema.parse(await res.json());
}

/** POST /api/admin/users/{userId}/staff — superuser-only on the backend. */
export async function setUserStaff(userId: string, isStaff: boolean): Promise<AdminUserRead> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/staff`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ is_staff: isStaff }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminUserReadSchema.parse(await res.json());
}

/** POST /api/admin/users/{userId}/deactivate — soft-delete, same
 * mechanism as the self-service DELETE /api/me. */
export async function deactivateUser(userId: string): Promise<AdminUserRead> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/deactivate`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminUserReadSchema.parse(await res.json());
}

/** GET /api/admin/users/{userId} — profile + group membership, for the
 * user detail page. Not the same shape listAdminUsers rows use, see
 * adminUserDetailSchema. */
export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminUserDetailSchema.parse(await res.json());
}

/** GET /api/admin/bookings/{bookingId} — one booking, with the owning
 * user's id/email attached (same shape as a listAdminBookings row). */
export async function getAdminBookingDetail(bookingId: string): Promise<AdminBookingRead> {
  const res = await fetch(`${API_URL}/api/admin/bookings/${bookingId}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminBookingReadSchema.parse(await res.json());
}

/** POST /api/admin/bookings — admin-marked-paid booking on behalf of an
 * existing customer, no real payment collection. See
 * backend/crud/payments.py's create_admin_booking. */
export async function createAdminBooking(
  request: AdminCreateBookingRequest,
): Promise<AdminBookingRead> {
  const res = await fetch(`${API_URL}/api/admin/bookings`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminBookingReadSchema.parse(await res.json());
}

/** POST /api/admin/users/{userId}/ban — reversible (see unbanUser),
 * unlike deactivateUser: never scrubs the account's email. */
export async function banUser(userId: string, reason: string): Promise<AdminUserRead> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/ban`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminUserReadSchema.parse(await res.json());
}

/** POST /api/admin/users/{userId}/unban */
export async function unbanUser(userId: string): Promise<AdminUserRead> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/unban`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminUserReadSchema.parse(await res.json());
}

/** POST /api/admin/bookings/{bookingId}/backfill-tickets — manually
 * re-checks Duffel for e-tickets on a booking that's still ticket-less
 * after the automatic booking-time retry window. Safe to call more than
 * once - a no-op once the booking has tickets. */
export async function backfillBookingTickets(bookingId: string): Promise<AdminBookingRead> {
  const res = await fetch(`${API_URL}/api/admin/bookings/${bookingId}/backfill-tickets`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminBookingReadSchema.parse(await res.json());
}

/** POST /api/admin/bookings/{bookingId}/resend-confirmation */
export async function resendBookingConfirmation(
  bookingId: string,
): Promise<MessageResponse> {
  const res = await fetch(
    `${API_URL}/api/admin/bookings/${bookingId}/resend-confirmation`,
    { method: "POST", credentials: "include", headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/* ---------- pricing: mirrors backend/routers/admin.py's sale/discount-code
 * routes - permission-gated (view/add/change/delete_pricing) on the
 * backend, same MANAGED_MODELS grid as everything else in utils/rbac.py. ---------- */

/** GET /api/admin/pricing/sales */
export async function listAdminPricingSales(): Promise<PricingSaleRead[]> {
  const res = await fetch(`${API_URL}/api/admin/pricing/sales`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return pricingSaleReadSchema.array().parse(await res.json());
}

/** POST /api/admin/pricing/sales — schedules a markup-rate override that
 * applies automatically to every customer during its window. */
export async function createAdminPricingSale(
  request: CreatePricingSaleRequest,
): Promise<PricingSaleRead> {
  const res = await fetch(`${API_URL}/api/admin/pricing/sales`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return pricingSaleReadSchema.parse(await res.json());
}

/** DELETE /api/admin/pricing/sales/{saleId} */
export async function deleteAdminPricingSale(saleId: string): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/admin/pricing/sales/${saleId}`, {
    method: "DELETE",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** GET /api/admin/pricing/discount-codes */
export async function listAdminDiscountCodes(): Promise<DiscountCodeRead[]> {
  const res = await fetch(`${API_URL}/api/admin/pricing/discount-codes`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return discountCodeReadSchema.array().parse(await res.json());
}

/** POST /api/admin/pricing/discount-codes */
export async function createAdminDiscountCode(
  request: CreateDiscountCodeRequest,
): Promise<DiscountCodeRead> {
  const res = await fetch(`${API_URL}/api/admin/pricing/discount-codes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return discountCodeReadSchema.parse(await res.json());
}

/** POST /api/admin/pricing/discount-codes/{discountCodeId}/active —
 * toggles a code on/off without deleting its redemption history. */
export async function setAdminDiscountCodeActive(
  discountCodeId: string,
  isActive: boolean,
): Promise<DiscountCodeRead> {
  const res = await fetch(
    `${API_URL}/api/admin/pricing/discount-codes/${discountCodeId}/active`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ is_active: isActive }),
    },
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return discountCodeReadSchema.parse(await res.json());
}

/* ---------- RBAC: mirrors backend/routers/admin.py's group/permission
 * routes - superuser-only on the backend, see adminGroupReadSchema's
 * docstring. ---------- */

/** GET /api/admin/permissions — the full, fixed set (utils/rbac.py's
 * MANAGED_MODELS x ACTIONS grid), for the group-permission editor. */
export async function listAdminPermissions(): Promise<AdminPermissionRead[]> {
  const res = await fetch(`${API_URL}/api/admin/permissions`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminPermissionReadSchema.array().parse(await res.json());
}

/** GET /api/admin/groups */
export async function listAdminGroups(): Promise<AdminGroupRead[]> {
  const res = await fetch(`${API_URL}/api/admin/groups`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminGroupReadSchema.array().parse(await res.json());
}

/** POST /api/admin/groups */
export async function createAdminGroup(name: string): Promise<AdminGroupRead> {
  const res = await fetch(`${API_URL}/api/admin/groups`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminGroupReadSchema.parse(await res.json());
}

/** POST /api/admin/groups/{groupId}/permissions — idempotent, adds any
 * codename not already granted (see backend/crud/rbac.py's
 * add_group_permissions). Returns the group's full updated permission
 * set, not just what was newly added. */
export async function assignGroupPermissions(
  groupId: number,
  codenames: string[],
): Promise<AdminGroupRead> {
  const res = await fetch(`${API_URL}/api/admin/groups/${groupId}/permissions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ codenames }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminGroupReadSchema.parse(await res.json());
}

/** DELETE /api/admin/groups/{groupId}/permissions/{codename} */
export async function revokeGroupPermission(
  groupId: number,
  codename: string,
): Promise<AdminGroupRead> {
  const res = await fetch(
    `${API_URL}/api/admin/groups/${groupId}/permissions/${codename}`,
    { method: "DELETE", credentials: "include", headers: await authHeaders() },
  );
  if (!res.ok) throw new Error(await errorDetail(res));
  return adminGroupReadSchema.parse(await res.json());
}

/** POST /api/admin/users/{userId}/groups — idempotent, same shape as
 * add_group_permissions above. */
export async function assignUserGroups(
  userId: string,
  groupIds: number[],
): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/groups`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ group_ids: groupIds }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** DELETE /api/admin/users/{userId}/groups/{groupId} */
export async function removeUserGroup(
  userId: string,
  groupId: number,
): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/groups/${groupId}`, {
    method: "DELETE",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/* ---------- notifications: mirrors backend/routers/notifications.py -
 * bell icon, works identically for a customer or staff/admin account.
 * GET /notifications/stream (SSE) isn't wrapped here - it's consumed
 * directly via the browser's native EventSource in
 * components/notifications/NotificationBell.tsx, not through fetch. ---------- */

/** GET /notifications — most recent first, backs the bell panel's
 * initial load/refresh (the SSE stream only covers what arrives while
 * connected). */
export async function listNotifications(
  params: { limit?: number; offset?: number } = {},
): Promise<NotificationListResponse> {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const res = await fetch(`${API_URL}/notifications?${search}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return notificationListResponseSchema.parse(await res.json());
}

/** GET /notifications/unread-count — cheap poll for the bell badge. */
export async function getUnreadNotificationCount(): Promise<UnreadCountResponse> {
  const res = await fetch(`${API_URL}/notifications/unread-count`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return unreadCountResponseSchema.parse(await res.json());
}

/** POST /notifications/{id}/read */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationRead> {
  const res = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return notificationReadSchema.parse(await res.json());
}

/** POST /notifications/read-all */
export async function markAllNotificationsRead(): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/notifications/read-all`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
}

/** DELETE /notifications/{notificationId} */
export async function deleteNotification(notificationId: string): Promise<MessageResponse> {
  const res = await fetch(`${API_URL}/notifications/${notificationId}`, {
    method: "DELETE",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return messageResponseSchema.parse(await res.json());
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
 * needed; a real per-service check (DB, Redis, Kafka) on the backend
 * (see backend/routers/health.py). */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return healthResponseSchema.parse(await res.json());
}

/** GET /booking/flight-orders/by-id/{bookingId}/refund — the traveller's own
 * refund for a cancelled booking. Resolves to null on 404, which is the
 * normal case (booking not cancelled, or a non-refundable fare owing
 * nothing) rather than an error worth surfacing. */
export async function getBookingRefund(bookingId: string): Promise<CustomerRefund | null> {
  const res = await fetch(`${API_URL}/booking/flight-orders/by-id/${bookingId}/refund`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorDetail(res));
  return customerRefundSchema.parse(await res.json());
}

/** GET /api/admin/refunds — staff view of every customer refund. */
export async function listAdminRefunds(
  params: { status?: RefundStatus; limit?: number; offset?: number } = {},
): Promise<RefundRead[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const res = await fetch(`${API_URL}/api/admin/refunds?${query}`, {
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return refundListSchema.parse(await res.json());
}

/** POST /api/admin/refunds/{refundId}/retry — re-send a failed refund. */
export async function retryAdminRefund(refundId: string): Promise<RefundRead> {
  const res = await fetch(`${API_URL}/api/admin/refunds/${refundId}/retry`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return refundReadSchema.parse(await res.json());
}

/** POST /api/admin/refunds/{refundId}/complete — mark a refund as actually
 * paid out. Pesapal never tells flyt this, so it's always a human call. */
export async function completeAdminRefund(refundId: string): Promise<RefundRead> {
  const res = await fetch(`${API_URL}/api/admin/refunds/${refundId}/complete`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return refundReadSchema.parse(await res.json());
}
