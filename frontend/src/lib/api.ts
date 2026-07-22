import type { FlightSearchResponse } from "./flights";

/**
 * Client for the FastAPI backend. Request types mirror
 * backend/schemas/flights.py::AmadeusFlightSearchRequest.
 */

export interface DepartureDateTimeRange {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
}

export interface OriginDestination {
  id: string;
  originLocationCode: string;
  destinationLocationCode: string;
  departureDateTimeRange: DepartureDateTimeRange;
}

export interface Traveler {
  id: string;
  travelerType: "ADULT" | "CHILD" | "SENIOR" | "HELD_INFANT";
  associatedAdultId?: string;
}

export interface CabinRestriction {
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
  coverage: "MOST_SEGMENTS" | "ALL_SEGMENTS";
  originDestinationIds: string[];
}

export interface FlightSearchRequest {
  currencyCode: string;
  originDestinations: OriginDestination[];
  travelers: Traveler[];
  sources: string[];
  searchCriteria?: {
    maxFlightOffers?: number;
    flightFilters?: { cabinRestrictions?: CabinRestriction[] };
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "flyt-token";

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* non-JSON error body */
  }
  return `Request failed (${res.status})`;
}

/* ---------- auth: mirrors backend/routers/users.py ---------- */

export interface UserRead {
  id: string;
  email: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

/** POST /api/register/ — create an account. */
export async function registerUser(
  email: string,
  password: string,
): Promise<UserRead> {
  const res = await fetch(`${API_URL}/api/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

/** POST /api/token — OAuth2 password flow; stores the bearer token. */
export async function loginUser(
  email: string,
  password: string,
): Promise<Token> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: email,
    password,
  });
  const res = await fetch(`${API_URL}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  const token: Token = await res.json();
  localStorage.setItem(TOKEN_KEY, token.access_token);
  return token;
}

export function getToken(): string | null {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

/** POST /flights/search — responses are cached server-side for 60s. */
export async function searchFlights(
  request: FlightSearchRequest,
): Promise<FlightSearchResponse> {
  const res = await fetch(`${API_URL}/flights/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Flight search failed (${res.status}): ${detail}`);
  }
  return res.json();
}
