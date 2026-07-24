/**
 * Zod schemas for everything we RECEIVE from the backend over HTTP —
 * response bodies are a real runtime boundary (network issues, backend
 * contract drift), unlike the request shapes we construct ourselves from
 * our own already-typed state (see types.ts). Types are inferred from
 * these schemas (z.infer), so the schema is the single source of truth for
 * both validation and the TypeScript type — not maintained by hand twice.
 *
 * Mirrors backend/schemas/duffel_flights.py and backend/schemas/bookings.py
 * field-for-field. FastAPI serializes `X | None = None` fields as a
 * present JSON key with value `null` (response_model_exclude_none is not
 * set anywhere on the backend), so those are `.nullable()`, not
 * `.optional()` — the key is always present.
 */

import { z } from "zod";

export const cabinClassSchema = z.enum(["first", "business", "premium_economy", "economy"]);
export const passengerTypeSchema = z.enum(["adult", "child", "infant_without_seat"]);
export const bookingStatusSchema = z.enum(["pending", "confirmed", "cancelled"]);
export const placeTypeSchema = z.enum(["airport", "city"]);

export type CabinClass = z.infer<typeof cabinClassSchema>;
export type PassengerType = z.infer<typeof passengerTypeSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type PlaceType = z.infer<typeof placeTypeSchema>;

/* ---------- auth: mirrors backend/routers/users.py ---------- */

export const userReadSchema = z.object({
  id: z.string(),
  email: z.string(),
});
export type UserRead = z.infer<typeof userReadSchema>;

export const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
});
export type Token = z.infer<typeof tokenSchema>;

/* ---------- shared offer/order building blocks ---------- */

export const airportSchema = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
  city_name: z.string().nullable(),
});
export type Airport = z.infer<typeof airportSchema>;

export const carrierSchema = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
});
export type Carrier = z.infer<typeof carrierSchema>;

export const aircraftSchema = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
});
export type Aircraft = z.infer<typeof aircraftSchema>;

/* ---------- search: POST/GET /shopping/flight-offers ---------- */

export const offerSegmentSchema = z.object({
  id: z.string(),
  origin: airportSchema,
  destination: airportSchema,
  departing_at: z.string(),
  arriving_at: z.string(),
  duration: z.string().nullable(),
  marketing_carrier: carrierSchema.nullable(),
  marketing_carrier_flight_number: z.string().nullable(),
  operating_carrier: carrierSchema.nullable(),
  aircraft: aircraftSchema.nullable(),
});
export type OfferSegment = z.infer<typeof offerSegmentSchema>;

export const offerSliceSchema = z.object({
  id: z.string(),
  origin: airportSchema,
  destination: airportSchema,
  duration: z.string().nullable(),
  segments: z.array(offerSegmentSchema),
});
export type OfferSlice = z.infer<typeof offerSliceSchema>;

export const offerPassengerSchema = z.object({
  id: z.string(),
  type: passengerTypeSchema.nullable(),
  age: z.number().nullable(),
});
export type OfferPassenger = z.infer<typeof offerPassengerSchema>;

export const offerSchema = z.object({
  id: z.string(),
  live_mode: z.boolean().nullable(),
  expires_at: z.string().nullable(),
  total_amount: z.string(),
  total_currency: z.string(),
  base_amount: z.string().nullable(),
  base_currency: z.string().nullable(),
  tax_amount: z.string().nullable(),
  tax_currency: z.string().nullable(),
  owner: carrierSchema.nullable(),
  slices: z.array(offerSliceSchema),
  passengers: z.array(offerPassengerSchema),
});
export type Offer = z.infer<typeof offerSchema>;

export const offerRequestSchema = z.object({
  id: z.string(),
  live_mode: z.boolean().nullable(),
  created_at: z.string().nullable(),
  passengers: z.array(offerPassengerSchema),
});
export type OfferRequest = z.infer<typeof offerRequestSchema>;

export const offerGroupSchema = z.object({
  primary: offerSchema,
  alternates: z.array(offerSchema),
});
export type OfferGroup = z.infer<typeof offerGroupSchema>;

export const airlineFacetSchema = z.object({
  code: z.string(),
  name: z.string(),
  count: z.number(),
});
export type AirlineFacet = z.infer<typeof airlineFacetSchema>;

export const offerFacetsSchema = z.object({
  airlines: z.array(airlineFacetSchema),
  price_min: z.number(),
  price_max: z.number(),
  has_direct: z.boolean(),
  has_one_stop: z.boolean(),
  has_multi_stop: z.boolean(),
});
export type OfferFacets = z.infer<typeof offerFacetsSchema>;

export const paginationMetaSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
  has_more: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const flightSearchResponseSchema = z.object({
  data: offerRequestSchema,
  groups: z.array(offerGroupSchema),
  meta: paginationMetaSchema,
  facets: offerFacetsSchema,
});
export type FlightSearchResponse = z.infer<typeof flightSearchResponseSchema>;

/* ---------- pricing: POST /shopping/flight-offers/pricing ---------- */

export const offerResponseSchema = z.object({ data: offerSchema });
export type OfferResponse = z.infer<typeof offerResponseSchema>;

/* ---------- seat maps: GET /shopping/seatmaps ---------- */

/** Seat availability/pricing is per-passenger in Duffel's API — each
 * available service names the specific passenger_id it applies to, so the
 * same seat can be available (or priced differently) for one passenger and
 * not another. See backend/utils/offer_filtering.py's sibling note; the
 * seat picker checks this per the currently-active passenger, not as a
 * flat available/unavailable boolean. */
export const availableSeatServiceSchema = z.object({
  id: z.string(),
  passenger_id: z.string(),
  total_amount: z.string(),
  total_currency: z.string(),
});
export type AvailableSeatService = z.infer<typeof availableSeatServiceSchema>;

export const seatElementSchema = z.object({
  type: z.enum(["seat", "bassinet", "empty", "lavatory", "galley", "closet", "stairs", "exit_row"]),
  designator: z.string().nullable().optional(),
  available_services: z.array(availableSeatServiceSchema).optional(),
});
export type SeatElement = z.infer<typeof seatElementSchema>;

export const seatMapCabinRowSchema = z.object({
  sections: z.array(z.object({ elements: z.array(seatElementSchema) })),
});
export type SeatMapCabinRow = z.infer<typeof seatMapCabinRowSchema>;

export const seatMapCabinSchema = z.object({
  cabin_class: cabinClassSchema,
  rows: z.array(seatMapCabinRowSchema),
});
export type SeatMapCabin = z.infer<typeof seatMapCabinSchema>;

export const seatMapSchema = z.object({
  id: z.string(),
  cabins: z.array(seatMapCabinSchema),
});
export type SeatMap = z.infer<typeof seatMapSchema>;

export const seatMapResponseSchema = z.object({ data: z.array(seatMapSchema) });
export type SeatMapResponse = z.infer<typeof seatMapResponseSchema>;

/* ---------- places: GET /shopping/places ---------- */

export const placeSchema: z.ZodType<Place> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: placeTypeSchema,
    name: z.string(),
    iata_code: z.string().nullable(),
    iata_country_code: z.string().nullable(),
    iata_city_code: z.string().nullable(),
    icao_code: z.string().nullable(),
    city_name: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    time_zone: z.string().nullable(),
    airports: z.array(placeSchema).nullable(),
  }),
);
export interface Place {
  id: string;
  type: PlaceType;
  name: string;
  iata_code: string | null;
  iata_country_code: string | null;
  iata_city_code: string | null;
  icao_code: string | null;
  city_name: string | null;
  latitude: number | null;
  longitude: number | null;
  time_zone: string | null;
  airports: Place[] | null;
}

export const placeSuggestionsResponseSchema = z.object({ data: z.array(placeSchema) });
export type PlaceSuggestionsResponse = z.infer<typeof placeSuggestionsResponseSchema>;

/* ---------- booking: POST /booking/flight-orders (creates a Duffel order) ---------- */

export const paymentStatusSchema = z.object({
  awaiting_payment: z.boolean().nullable(),
  payment_required_by: z.string().nullable(),
  price_guarantee_expires_at: z.string().nullable(),
});
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const orderConditionDetailSchema = z.object({
  allowed: z.boolean().nullable(),
  penalty_amount: z.string().nullable(),
  penalty_currency: z.string().nullable(),
});
export type OrderConditionDetail = z.infer<typeof orderConditionDetailSchema>;

export const orderConditionsSchema = z.object({
  refund_before_departure: orderConditionDetailSchema.nullable(),
  change_before_departure: orderConditionDetailSchema.nullable(),
});
export type OrderConditions = z.infer<typeof orderConditionsSchema>;

export const orderPassengerDetailSchema = z.object({
  id: z.string(),
  type: passengerTypeSchema.nullable(),
  title: z.string().nullable(),
  gender: z.string().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  born_on: z.string().nullable(),
  email: z.string().nullable(),
  phone_number: z.string().nullable(),
  infant_passenger_id: z.string().nullable(),
});
export type OrderPassengerDetail = z.infer<typeof orderPassengerDetailSchema>;

export const orderSchema = z.object({
  id: z.string(),
  booking_reference: z.string().nullable(),
  live_mode: z.boolean().nullable(),
  created_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  total_amount: z.string().nullable(),
  total_currency: z.string().nullable(),
  base_amount: z.string().nullable(),
  base_currency: z.string().nullable(),
  tax_amount: z.string().nullable(),
  tax_currency: z.string().nullable(),
  owner: carrierSchema.nullable(),
  slices: z.array(offerSliceSchema),
  passengers: z.array(orderPassengerDetailSchema),
  payment_status: paymentStatusSchema.nullable(),
  conditions: orderConditionsSchema.nullable(),
  available_actions: z.array(z.string()),
});
export type Order = z.infer<typeof orderSchema>;

export const orderResponseSchema = z.object({ data: orderSchema });
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const orderCancellationQuoteSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  refund_amount: z.string().nullable(),
  refund_currency: z.string().nullable(),
  refund_to: z.string().nullable(),
  expires_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
});
export type OrderCancellationQuote = z.infer<typeof orderCancellationQuoteSchema>;

export const orderCancellationResponseSchema = z.object({ data: orderCancellationQuoteSchema });
export type OrderCancellationResponse = z.infer<typeof orderCancellationResponseSchema>;

/* ---------- our own bookings: GET /booking/flight-orders (backend/schemas/bookings.py) ---------- */

export const flightPublicSchema = z.object({
  id: z.string(),
  duffel_segment_id: z.string(),
  origin_iata_code: z.string(),
  origin_name: z.string().nullable(),
  destination_iata_code: z.string(),
  destination_name: z.string().nullable(),
  departing_at: z.string(),
  arriving_at: z.string(),
  duration: z.string().nullable(),
  marketing_carrier_iata_code: z.string().nullable(),
  marketing_carrier_name: z.string().nullable(),
  marketing_carrier_flight_number: z.string().nullable(),
  operating_carrier_iata_code: z.string().nullable(),
  operating_carrier_name: z.string().nullable(),
  aircraft_name: z.string().nullable(),
});
export type FlightPublic = z.infer<typeof flightPublicSchema>;

export const bookingSlicePublicSchema = z.object({
  id: z.string(),
  duffel_slice_id: z.string(),
  origin_iata_code: z.string(),
  origin_name: z.string().nullable(),
  origin_city_name: z.string().nullable(),
  destination_iata_code: z.string(),
  destination_name: z.string().nullable(),
  destination_city_name: z.string().nullable(),
  duration: z.string().nullable(),
  flights: z.array(flightPublicSchema),
});
export type BookingSlicePublic = z.infer<typeof bookingSlicePublicSchema>;

export const bookingPassengerPublicSchema = z.object({
  id: z.string(),
  duffel_passenger_id: z.string(),
  passenger_type: passengerTypeSchema.nullable(),
  given_name: z.string(),
  family_name: z.string(),
  born_on: z.string().nullable(),
  email: z.string().nullable(),
  phone_number: z.string().nullable(),
  seat_designator: z.string().nullable(),
  cabin_class: cabinClassSchema.nullable(),
});
export type BookingPassengerPublic = z.infer<typeof bookingPassengerPublicSchema>;

export const bookingPublicSchema = z.object({
  id: z.string(),
  duffel_order_id: z.string(),
  booking_reference: z.string(),
  status: bookingStatusSchema,
  total_amount: z.string(),
  total_currency: z.string(),
  owner_iata_code: z.string().nullable(),
  owner_name: z.string().nullable(),
  created_at: z.string(),
  cancelled_at: z.string().nullable(),
  slices: z.array(bookingSlicePublicSchema),
  passengers: z.array(bookingPassengerPublicSchema),
});
export type BookingPublic = z.infer<typeof bookingPublicSchema>;

export const bookingListResponseSchema = z.object({
  data: z.array(bookingPublicSchema),
  meta: paginationMetaSchema,
});
export type BookingListResponse = z.infer<typeof bookingListResponseSchema>;
