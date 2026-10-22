import type { FlightSupplier, OfferPricer, PlaceSupplier } from "@application/ports";
import type { Place, PlaceQuery } from "@domain/places/place";
import type {
  Aircraft,
  Airport,
  AvailableService,
  Cabin,
  Carrier,
  ConditionDetail,
  Conditions,
  Offer,
  OfferPassenger,
  OfferRequestSummary,
  OfferSegment,
  OfferSegmentPassenger,
  OfferSlice,
  OfferSliceConditions,
  PassengerType,
  PaymentRequirements,
  SearchResult,
} from "@domain/flights/offer";
import type { OfferRequestPlan } from "@domain/flights/offer-request";

const DUFFEL_BASE_URL = "https://api.duffel.com";
const DUFFEL_API_VERSION = "v2";

export class DuffelError extends Error {
  constructor(
    readonly status: number,
    readonly errors: { message?: string; title?: string }[],
  ) {
    super(errors.map((e) => e.message ?? e.title ?? "").join("; ") || `Duffel HTTP ${status}`);
  }
}

type Json = Record<string, unknown>;

async function duffelRequest<T>(
  apiToken: string,
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: Json } = {},
): Promise<T> {
  const url = new URL(path, DUFFEL_BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Duffel-Version": DUFFEL_API_VERSION,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { errors?: [] };
    throw new DuffelError(response.status, failure.errors ?? []);
  }

  return (await response.json()) as T;
}

/* ---------- places ---------- */

type DuffelPlace = {
  id: string;
  type: string;
  name: string;
  iata_code?: string | null;
  iata_country_code?: string | null;
  iata_city_code?: string | null;
  icao_code?: string | null;
  city_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  time_zone?: string | null;
  airports?: DuffelPlace[] | null;
};

function toPlace(raw: DuffelPlace): Place {
  return {
    id: raw.id,
    type: raw.type === "city" ? "city" : "airport",
    name: raw.name,
    iataCode: raw.iata_code ?? null,
    iataCountryCode: raw.iata_country_code ?? null,
    iataCityCode: raw.iata_city_code ?? null,
    icaoCode: raw.icao_code ?? null,
    cityName: raw.city_name ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    timeZone: raw.time_zone ?? null,
    airports: raw.airports?.map(toPlace) ?? null,
  };
}

export function duffelPlaceSupplier(apiToken: string): PlaceSupplier {
  return {
    async suggest(query: PlaceQuery): Promise<Place[]> {
      const params: Record<string, string> =
        "text" in query
          ? { query: query.text }
          : { lat: String(query.lat), lng: String(query.lng), rad: String(query.radiusMetres) };

      const body = await duffelRequest<{ data: DuffelPlace[] }>(
        apiToken,
        "GET",
        "/places/suggestions",
        { query: params },
      );
      return body.data.map(toPlace);
    },
  };
}

/* ---------- flights ----------
 * Duffel sends an explicit null for some empty collections, not just an
 * absent key, so every list is normalised here rather than defended against
 * in each algorithm downstream.
 */

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const list = <T>(value: T[] | null | undefined): T[] => value ?? [];
const or = <T>(value: T | null | undefined): T | null => value ?? null;

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Timestamps reach clients in the form the FastAPI service emitted: trailing
 * zero microseconds dropped, UTC written as Z, a per-airport local time left
 * without an offset. Anything unrecognised passes through untouched.
 */
function timestamp(value: string | null | undefined): string | null {
  const match = value ? TIMESTAMP.exec(value) : null;
  if (!match) return value ?? null;

  const [, date, time, fraction, offset] = match;
  const micros = (fraction ?? "").padEnd(6, "0").slice(0, 6);
  const zone =
    offset === undefined
      ? ""
      : /^(Z|[+-]00:?00)$/.test(offset)
        ? "Z"
        : offset.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");

  return `${date}T${time}${micros === "000000" ? "" : `.${micros}`}${zone}`;
}

function toAirport(raw: Raw | null | undefined): Airport {
  return {
    iata_code: or(raw?.iata_code),
    name: or(raw?.name),
    city_name: or(raw?.city_name),
    time_zone: or(raw?.time_zone),
  };
}

function toCarrier(raw: Raw | null | undefined): Carrier | null {
  if (!raw) return null;
  return { iata_code: or(raw.iata_code), name: or(raw.name), logo_symbol_url: or(raw.logo_symbol_url) };
}

function toAircraft(raw: Raw | null | undefined): Aircraft | null {
  return raw ? { iata_code: or(raw.iata_code), name: or(raw.name) } : null;
}

function toConditionDetail(raw: Raw | null | undefined): ConditionDetail | null {
  if (!raw) return null;
  return {
    allowed: or(raw.allowed),
    penalty_amount: or(raw.penalty_amount),
    penalty_currency: or(raw.penalty_currency),
  };
}

function toConditions(raw: Raw | null | undefined): Conditions | null {
  if (!raw) return null;
  return {
    refund_before_departure: toConditionDetail(raw.refund_before_departure),
    change_before_departure: toConditionDetail(raw.change_before_departure),
  };
}

function toSliceConditions(raw: Raw | null | undefined): OfferSliceConditions | null {
  if (!raw) return null;
  return {
    change_before_departure: toConditionDetail(raw.change_before_departure),
    priority_check_in: or(raw.priority_check_in),
    priority_boarding: or(raw.priority_boarding),
    advance_seat_selection: or(raw.advance_seat_selection),
  };
}

function toPaymentRequirements(raw: Raw | null | undefined): PaymentRequirements | null {
  if (!raw) return null;
  return {
    requires_instant_payment: or(raw.requires_instant_payment),
    price_guarantee_expires_at: timestamp(raw.price_guarantee_expires_at),
    payment_required_by: timestamp(raw.payment_required_by),
  };
}

function toCabin(raw: Raw | null | undefined): Cabin | null {
  if (!raw) return null;
  const amenities = raw.amenities as Raw | null | undefined;
  return {
    name: or(raw.name),
    marketing_name: or(raw.marketing_name),
    amenities: amenities
      ? {
          seat: amenities.seat
            ? {
                pitch: or(amenities.seat.pitch),
                legroom: or(amenities.seat.legroom),
                type: or(amenities.seat.type),
              }
            : null,
          wifi: amenities.wifi
            ? { available: or(amenities.wifi.available), cost: or(amenities.wifi.cost) }
            : null,
          power: amenities.power ? { available: or(amenities.power.available) } : null,
        }
      : null,
  };
}

function toSegmentPassenger(raw: Raw): OfferSegmentPassenger {
  return {
    passenger_id: raw.passenger_id,
    baggages: list<Raw>(raw.baggages).map((b) => ({ type: b.type, quantity: b.quantity })),
    cabin: toCabin(raw.cabin),
    cabin_class: or(raw.cabin_class),
    cabin_class_marketing_name: or(raw.cabin_class_marketing_name),
    fare_basis_code: or(raw.fare_basis_code),
  };
}

function toSegment(raw: Raw): OfferSegment {
  return {
    id: raw.id,
    origin: toAirport(raw.origin),
    destination: toAirport(raw.destination),
    origin_terminal: or(raw.origin_terminal),
    destination_terminal: or(raw.destination_terminal),
    departing_at: timestamp(raw.departing_at)!,
    arriving_at: timestamp(raw.arriving_at)!,
    duration: or(raw.duration),
    distance: raw.distance === null || raw.distance === undefined ? null : Number(raw.distance),
    marketing_carrier: toCarrier(raw.marketing_carrier),
    marketing_carrier_flight_number: or(raw.marketing_carrier_flight_number),
    operating_carrier: toCarrier(raw.operating_carrier),
    operating_carrier_flight_number: or(raw.operating_carrier_flight_number),
    aircraft: toAircraft(raw.aircraft),
    stops: list(raw.stops),
    passengers: list<Raw>(raw.passengers).map(toSegmentPassenger),
  };
}

function toSlice(raw: Raw): OfferSlice {
  return {
    id: raw.id,
    origin: toAirport(raw.origin),
    destination: toAirport(raw.destination),
    duration: or(raw.duration),
    fare_brand_name: or(raw.fare_brand_name),
    conditions: toSliceConditions(raw.conditions),
    segments: list<Raw>(raw.segments).map(toSegment),
  };
}

function toOfferPassenger(raw: Raw): OfferPassenger {
  return {
    id: raw.id,
    type: (or(raw.type) as PassengerType | null),
    age: or(raw.age),
    fare_type: or(raw.fare_type),
  };
}

function toAvailableService(raw: Raw): AvailableService {
  return {
    id: raw.id,
    type: raw.type,
    total_amount: raw.total_amount,
    total_currency: raw.total_currency,
    maximum_quantity: raw.maximum_quantity ?? 1,
    passenger_ids: list(raw.passenger_ids),
    segment_ids: list(raw.segment_ids),
    metadata: raw.metadata ?? {},
  };
}

function toOffer(raw: Raw): Offer {
  return {
    id: raw.id,
    live_mode: or(raw.live_mode),
    expires_at: timestamp(raw.expires_at),
    total_amount: raw.total_amount,
    total_currency: raw.total_currency,
    base_amount: or(raw.base_amount),
    base_currency: or(raw.base_currency),
    tax_amount: or(raw.tax_amount),
    tax_currency: or(raw.tax_currency),
    total_emissions_kg: or(raw.total_emissions_kg),
    partial: or(raw.partial),
    owner: toCarrier(raw.owner),
    slices: list<Raw>(raw.slices).map(toSlice),
    passengers: list<Raw>(raw.passengers).map(toOfferPassenger),
    passenger_identity_documents_required: raw.passenger_identity_documents_required ?? false,
    supported_passenger_identity_document_types: list(
      raw.supported_passenger_identity_document_types,
    ),
    conditions: toConditions(raw.conditions),
    payment_requirements: toPaymentRequirements(raw.payment_requirements),
    available_services: list<Raw>(raw.available_services).map(toAvailableService),
  };
}

function toOfferRequestSummary(raw: Raw): OfferRequestSummary {
  return {
    id: raw.id,
    live_mode: or(raw.live_mode),
    created_at: timestamp(raw.created_at),
    passengers: list<Raw>(raw.passengers).map(toOfferPassenger),
  };
}

function toRequestBody(plan: OfferRequestPlan): Json {
  return {
    slices: plan.slices.map((s) => ({
      origin: s.origin,
      destination: s.destination,
      departure_date: s.departureDate,
    })),
    passengers: plan.passengers.map((p) => (p.type !== null ? { type: p.type } : { age: p.age })),
    ...(plan.cabinClass !== null ? { cabin_class: plan.cabinClass } : {}),
    ...(plan.maxConnections !== null ? { max_connections: plan.maxConnections } : {}),
  };
}

export function duffelFlightSupplier(apiToken: string): FlightSupplier {
  return {
    async searchOffers(plan: OfferRequestPlan): Promise<SearchResult> {
      const body = await duffelRequest<{ data: Raw }>(apiToken, "POST", "/air/offer_requests", {
        query: { return_offers: "true" },
        body: { data: toRequestBody(plan) },
      });
      return {
        offerRequest: toOfferRequestSummary(body.data),
        offers: list<Raw>(body.data.offers).map(toOffer),
      };
    },
  };
}

/**
 * Duffel has no separate pricing endpoint: re-fetching a single offer returns
 * its up-to-date total, which is why this is a read and not a quote call.
 */
export function duffelOfferPricer(apiToken: string): OfferPricer {
  return {
    async confirmPrice(offerId: string) {
      const body = await duffelRequest<{ data: { total_amount: string; total_currency: string } }>(
        apiToken,
        "GET",
        `/air/offers/${offerId}`,
        { query: { return_available_services: "true" } },
      );
      return { totalAmount: body.data.total_amount, totalCurrency: body.data.total_currency };
    },
  };
}
