/**
 * The seams. Use cases depend on this file and nothing below it, so they run
 * against plain objects. Adapters in infrastructure/ implement these.
 */

export interface Clock {
  now(): Date;
}

/** not_configured: a dependency this environment deliberately lacks. */
export type ServiceStatus = "healthy" | "unhealthy" | "not_configured";
export type OverallStatus = "healthy" | "degraded" | "down";

export type ServiceHealth = {
  status: ServiceStatus;
  detail: string | null;
};

export interface HealthCheck {
  check(): Promise<ServiceHealth>;
}

import type { PopularRoute } from "@domain/routes/popular-route";

export interface RouteRepository {
  popularRoutes(options: { limit: number; minBookings: number }): Promise<PopularRoute[]>;
}

import type { Place, PlaceQuery } from "@domain/places/place";

export interface PlaceSupplier {
  suggest(query: PlaceQuery): Promise<Place[]>;
}

/** Read-through cache. Misses return null rather than throwing. */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

import type { OfferRequestPlan } from "@domain/flights/offer-request";
import type { SearchResult } from "@domain/flights/offer";

export interface FlightSupplier {
  searchOffers(plan: OfferRequestPlan): Promise<SearchResult>;
}

/** The markup in force right now; an admin-scheduled sale can replace it. */
export interface MarkupPolicy {
  activeRate(at: Date): Promise<number>;
}

import type { Account } from "@domain/auth/account";
import type { TokenClaims } from "@domain/auth/access-token";

/** The hash never travels with the account; only sign-in has any use for it. */
export type Credential = {
  account: Account;
  /** Null for an account that only ever signed in through a provider. */
  passwordHash: string | null;
};

export interface AccountRepository {
  byEmail(email: string): Promise<Account | null>;
  credentialByEmail(email: string): Promise<Credential | null>;
  /**
   * Also stamps password_changed_at, which is what ends every session issued
   * before now - including the one that asked for the change.
   */
  setPassword(accountId: string, hash: string, at: Date): Promise<void>;
  /**
   * Soft delete. The row stays so bookings and payments stay linked; the
   * identity is scrubbed instead, which also frees the address for reuse.
   */
  scrub(account: Account, placeholderHash: string, at: Date): Promise<void>;
}

/** Which address an email goes out under - the Python service picks per purpose. */
export type MailSender = "welcome" | "transactional" | "bookings" | "support";

export type MailMessage = {
  to: string;
  subject: string;
  /** Blank-line-separated paragraphs, escaped and wrapped by the adapter. */
  bodyText: string;
  from: MailSender;
};

/**
 * Fire and forget by contract, matching the BackgroundTasks this replaces: a
 * failed send must never undo the change that triggered it, and nobody should
 * wait on an inbox to get a response.
 */
export interface Mailer {
  send(message: MailMessage): void;
}

/** Returns null for anything it cannot vouch for: bad signature, expired, malformed. */
export interface TokenVerifier {
  verify(token: string): Promise<TokenClaims | null>;
}

export interface TokenSigner {
  sign(claims: TokenClaims): Promise<string>;
}

export interface PasswordHasher {
  /** False rather than throwing when there is no hash to check against. */
  verify(plain: string, hash: string | null): Promise<boolean>;
  hash(plain: string): Promise<string>;
}

import type { Booking, BookingFilters } from "@domain/bookings/booking";
import type { Cursor, KeysetPage } from "@domain/pagination/keyset";

/**
 * Every read is scoped to one account. Not owning a booking reads as not
 * finding it, so a guessed id cannot be used to confirm one exists.
 */
export interface BookingRepository {
  pageFor(
    accountId: string,
    request: { filters: BookingFilters; cursor: Cursor; size: number },
  ): Promise<KeysetPage<Booking>>;
  byIdFor(accountId: string, bookingId: string): Promise<Booking | null>;
  byTicketNumberFor(accountId: string, ticketNumber: string): Promise<Booking | null>;
}

import type { DueDeparture } from "@domain/reminders/departure";

export type NotificationType =
  | "booking_confirmed"
  | "booking_failed"
  | "airline_change"
  | "cancellation_confirmed"
  | "change_confirmed"
  | "departure_reminder"
  | "support_request"
  | "discount_redemption_failed";

export type Notification = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkUrl: string | null;
};

export interface NotificationRepository {
  create(notification: Notification): Promise<void>;
}

export interface DepartureReminderRepository {
  due(now: Date, leadTimeHours: number): Promise<DueDeparture[]>;
  /**
   * Stamps a leg as reminded, and says whether this caller is the one that
   * got it. Claimed before anything is sent and conditional on the column
   * still being empty, so two sweeps racing over one leg produce one winner.
   */
  claim(sliceId: string, at: Date): Promise<boolean>;
  /** Hands a leg back after a failed send, so the next sweep retries it. */
  release(sliceId: string): Promise<void>;
}

/** Rendered mail, for the messages that are markup rather than paragraphs. */
export type HtmlMailMessage = {
  to: string;
  subject: string;
  html: string;
  from: MailSender;
};

export interface HtmlMailer {
  sendHtml(message: HtmlMailMessage): Promise<void>;
}

import type { DiscountCode } from "@domain/pricing/discount";

export interface DiscountRepository {
  /** Codes are stored and looked up uppercased, so FLYT10 and flyt10 are one. */
  byCode(code: string): Promise<DiscountCode | null>;
}

/** A traveller's own view of the refund owed on a cancelled booking. */
export type CustomerRefund = {
  amount: string;
  currency: string;
  /** Pesapal never confirms a refund landed, so "paid" only comes from staff. */
  status: "paid" | "processing";
  created_at: string;
};

export interface RefundRepository {
  forBooking(accountId: string, bookingId: string): Promise<CustomerRefund | null>;
}

/** Re-fetching an offer is how Duffel reports its live price. */
export interface OfferPricer {
  confirmPrice(offerId: string): Promise<{ totalAmount: string; totalCurrency: string }>;
}
