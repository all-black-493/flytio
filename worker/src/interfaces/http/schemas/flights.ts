import { z } from "zod";
import {
  airlineCode,
  cabinClass,
  currencyCode,
  decimalAmount,
  iataCodeInput,
  isoDateTime,
  passengerType,
  queryList,
  upcomingDate,
} from "@interfaces/http/schemas/primitives";
import { offsetMeta, offsetQuery } from "@interfaces/http/schemas/pagination";

/* ---------- shared vocabulary ---------- */

export const offerSortKey = z.enum(["best", "price", "duration", "departure", "arrival"]);
export const departureWindow = z.enum(["morning", "afternoon", "evening", "night"]);

/** Duffel's connection cap: a third stop is a different trip, not an itinerary. */
const maxConnections = z.coerce.number().int().min(0).max(2);

/* ---------- requests ---------- */

export const slicePlan = z.object({
  origin: iataCodeInput,
  destination: iataCodeInput,
  departure_date: upcomingDate,
});

/** A passenger is described by type or by exact age. */
export const searchPassenger = z.object({
  type: passengerType.optional(),
  age: z.number().int().min(0).max(130).optional(),
});

export const offerRequestCreate = z.object({
  slices: z.array(slicePlan).min(1),
  passengers: z.array(searchPassenger).min(1),
  cabin_class: cabinClass.optional(),
  max_connections: maxConnections.optional(),
});

/**
 * Applied to an already-fetched offer list, so none of it reaches the supplier
 * or the cache key - which is why every filter and page of one search costs a
 * single Duffel call.
 */
export const offerListQuery = z
  .object({
    sort: offerSortKey.default("price"),
    airlines: queryList(airlineCode),
    max_stops: z.coerce.number().int().min(0).optional(),
    price_max: z.coerce.number().min(0).optional(),
    depart_windows: queryList(departureWindow),
    max_duration_minutes: z.coerce.number().int().min(0).optional(),
  })
  .extend(offsetQuery.shape);

export const flightSearchQuery = z
  .object({
    origin: iataCodeInput,
    destination: iataCodeInput,
    departure_date: upcomingDate,
    return_date: upcomingDate.optional(),
    adults: z.coerce.number().int().min(1).default(1),
    children: z.coerce.number().int().min(0).default(0),
    infants: z.coerce.number().int().min(0).default(0),
    cabin_class: cabinClass.optional(),
    max_connections: maxConnections.optional(),
  })
  .refine(
    (q) => q.return_date === undefined || q.return_date >= q.departure_date,
    { message: "return_date cannot be before departure_date", path: ["return_date"] },
  );

/** The GET route carries the trip and the view at once, so it needs both. */
export const flightSearchAndListQuery = flightSearchQuery.and(offerListQuery);

/* ---------- responses ---------- */

// Codes and amounts that come straight from the supplier stay plain strings:
// rejecting Duffel's own data would turn a live search into a 500.
const airport = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
  city_name: z.string().nullable(),
  time_zone: z.string().nullable(),
});

const carrier = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
  logo_symbol_url: z.url().nullable(),
});

const aircraft = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
});

const baggage = z.object({
  type: z.string(),
  quantity: z.number().int(),
});

/** null means the airline does not report the condition, not that it is denied. */
const conditionDetail = z.object({
  allowed: z.boolean().nullable(),
  penalty_amount: z.string().nullable(),
  penalty_currency: z.string().nullable(),
});

const conditions = z.object({
  refund_before_departure: conditionDetail.nullable(),
  change_before_departure: conditionDetail.nullable(),
});

const sliceConditions = z.object({
  change_before_departure: conditionDetail.nullable(),
  priority_check_in: z.boolean().nullable(),
  priority_boarding: z.boolean().nullable(),
  advance_seat_selection: z.boolean().nullable(),
});

const paymentRequirements = z.object({
  requires_instant_payment: z.boolean().nullable(),
  price_guarantee_expires_at: isoDateTime.nullable(),
  payment_required_by: isoDateTime.nullable(),
});

const cabin = z.object({
  name: z.string().nullable(),
  marketing_name: z.string().nullable(),
  amenities: z
    .object({
      seat: z
        .object({
          pitch: z.string().nullable(),
          legroom: z.string().nullable(),
          type: z.string().nullable(),
        })
        .nullable(),
      wifi: z.object({ available: z.boolean().nullable(), cost: z.string().nullable() }).nullable(),
      power: z.object({ available: z.boolean().nullable() }).nullable(),
    })
    .nullable(),
});

/** baggages is the allowance included in the fare; extras are available_services. */
const segmentPassenger = z.object({
  passenger_id: z.string(),
  baggages: z.array(baggage),
  cabin: cabin.nullable(),
  cabin_class: z.string().nullable(),
  cabin_class_marketing_name: z.string().nullable(),
  fare_basis_code: z.string().nullable(),
});

const segment = z.object({
  id: z.string(),
  origin: airport,
  destination: airport,
  origin_terminal: z.union([z.string(), z.number()]).nullable(),
  destination_terminal: z.union([z.string(), z.number()]).nullable(),
  departing_at: isoDateTime,
  arriving_at: isoDateTime,
  duration: z.string().nullable(),
  distance: z.number().nullable(),
  marketing_carrier: carrier.nullable(),
  marketing_carrier_flight_number: z.string().nullable(),
  operating_carrier: carrier.nullable(),
  operating_carrier_flight_number: z.string().nullable(),
  aircraft: aircraft.nullable(),
  stops: z.array(z.record(z.string(), z.unknown())),
  passengers: z.array(segmentPassenger),
});

const offerSlice = z.object({
  id: z.string(),
  origin: airport,
  destination: airport,
  duration: z.string().nullable(),
  fare_brand_name: z.string().nullable(),
  conditions: sliceConditions.nullable(),
  segments: z.array(segment),
});

const offerPassenger = z.object({
  id: z.string(),
  type: passengerType.nullable(),
  age: z.number().int().nullable(),
  fare_type: z.string().nullable(),
});

const availableService = z.object({
  id: z.string(),
  type: z.string(),
  total_amount: z.string(),
  total_currency: z.string(),
  maximum_quantity: z.number().int(),
  passenger_ids: z.array(z.string()),
  segment_ids: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
});

export const offer = z.object({
  id: z.string(),
  live_mode: z.boolean().nullable(),
  expires_at: isoDateTime.nullable(),
  total_amount: decimalAmount,
  total_currency: currencyCode,
  base_amount: decimalAmount.nullable(),
  base_currency: currencyCode.nullable(),
  tax_amount: decimalAmount.nullable(),
  tax_currency: currencyCode.nullable(),
  total_emissions_kg: z.union([z.string(), z.number()]).nullable(),
  partial: z.boolean().nullable(),
  owner: carrier.nullable(),
  slices: z.array(offerSlice),
  passengers: z.array(offerPassenger),
  passenger_identity_documents_required: z.boolean(),
  supported_passenger_identity_document_types: z.array(z.string()),
  conditions: conditions.nullable(),
  payment_requirements: paymentRequirements.nullable(),
  available_services: z.array(availableService),
});

export const offerRequestSummary = z.object({
  id: z.string(),
  live_mode: z.boolean().nullable(),
  created_at: isoDateTime.nullable(),
  passengers: z.array(offerPassenger),
});

/** Offers on the same flights, cheapest leading - see groupByItinerary. */
export const offerGroup = z.object({
  primary: offer,
  alternates: z.array(offer),
});

export const offerFacets = z.object({
  airlines: z.array(z.object({ code: z.string(), name: z.string(), count: z.number().int() })),
  price_min: z.number(),
  price_max: z.number(),
  has_direct: z.boolean(),
  has_one_stop: z.boolean(),
  has_multi_stop: z.boolean(),
});

export const flightSearchResponse = z.object({
  data: offerRequestSummary,
  groups: z.array(offerGroup),
  meta: offsetMeta,
  facets: offerFacets,
});

export type OfferRequestCreate = z.infer<typeof offerRequestCreate>;
export type OfferListQuery = z.infer<typeof offerListQuery>;
export type FlightSearchQuery = z.infer<typeof flightSearchQuery>;
