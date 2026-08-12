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
  is_staff: z.boolean(),
  is_superuser: z.boolean(),
});
export type UserRead = z.infer<typeof userReadSchema>;

export const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
});
export type Token = z.infer<typeof tokenSchema>;

/** Generic ack shape shared by /api/forgot-password and /api/reset-password. */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** GET /health — mirrors backend/schemas/health.py. "not_configured"
 * (a service, e.g. Kafka, has no broker set in this environment) is
 * distinct from "unhealthy" and deliberately doesn't count toward
 * "degraded" - see that file's own comment on why. */
export const serviceStatusSchema = z.enum(["healthy", "unhealthy", "not_configured"]);
export const overallHealthStatusSchema = z.enum(["healthy", "degraded", "down"]);

export const serviceHealthSchema = z.object({
  status: serviceStatusSchema,
  detail: z.string().nullable(),
});

export const healthResponseSchema = z.object({
  status: overallHealthStatusSchema,
  checked_at: z.string(),
  services: z.record(z.string(), serviceHealthSchema),
});
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type OverallHealthStatus = z.infer<typeof overallHealthStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

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
  logo_symbol_url: z.string().nullable(),
});
export type Carrier = z.infer<typeof carrierSchema>;

export const aircraftSchema = z.object({
  iata_code: z.string().nullable(),
  name: z.string().nullable(),
});
export type Aircraft = z.infer<typeof aircraftSchema>;

/** Shared shape for every refund/change condition Duffel returns - on an
 * offer (pre-purchase) or an order (post-purchase); see
 * backend/schemas/duffel_flights.py's ConditionDetail/Conditions. */
export const conditionDetailSchema = z.object({
  allowed: z.boolean().nullable(),
  penalty_amount: z.string().nullable(),
  penalty_currency: z.string().nullable(),
});
export type ConditionDetail = z.infer<typeof conditionDetailSchema>;

export const conditionsSchema = z.object({
  refund_before_departure: conditionDetailSchema.nullable(),
  change_before_departure: conditionDetailSchema.nullable(),
});
export type Conditions = z.infer<typeof conditionsSchema>;

/* ---------- search: POST/GET /shopping/flight-offers ---------- */

export const offerSegmentSchema = z.object({
  id: z.string(),
  origin: airportSchema,
  destination: airportSchema,
  // Duffel's sandbox has been observed sending this as either a string
  // or a number - matches backend/schemas/duffel_flights.py's
  // `str | int | None` typing for the same field.
  origin_terminal: z.union([z.string(), z.number()]).nullable(),
  destination_terminal: z.union([z.string(), z.number()]).nullable(),
  departing_at: z.string(),
  arriving_at: z.string(),
  duration: z.string().nullable(),
  marketing_carrier: carrierSchema.nullable(),
  marketing_carrier_flight_number: z.string().nullable(),
  operating_carrier: carrierSchema.nullable(),
  operating_carrier_flight_number: z.string().nullable(),
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
  fare_type: z.string().nullable(),
});
export type OfferPassenger = z.infer<typeof offerPassengerSchema>;

export const availableServiceSchema = z.object({
  id: z.string(),
  type: z.string(),
  total_amount: z.string(),
  total_currency: z.string(),
  maximum_quantity: z.number().default(1),
  passenger_ids: z.array(z.string()).default([]),
  segment_ids: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AvailableService = z.infer<typeof availableServiceSchema>;

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
  passenger_identity_documents_required: z.boolean().default(false),
  supported_passenger_identity_document_types: z.array(z.string()).default([]),
  available_services: z.array(availableServiceSchema).default([]),
  // True for a self-transfer itinerary Duffel stitched together from
  // separate airlines' offers - no through check-in/baggage, and a
  // missed connection isn't the airline's responsibility. Worth flagging
  // to the traveler wherever an offer is shown.
  partial: z.boolean().nullable().default(null),
  // Pre-purchase refund/change eligibility - shown before checkout so a
  // customer isn't surprised by a non-refundable fare after paying.
  conditions: conditionsSchema.nullable().default(null),
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

/** Offset pagination — flight search only. Every DB-backed list uses
 * cursorPageSchema below instead; search keeps offsets because it pages a
 * Redis-cached Duffel response already held in memory (there is no
 * row-skipping cost to avoid) and its UI shows a result count. */
export const paginationMetaSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
  has_more: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** One page of a cursor-paginated list, mirroring fastapi-pagination's
 * CursorPage (see backend/utils/pagination.py). Every DB-backed list
 * endpoint returns this exact shape, so it's declared once and
 * specialised per item type rather than restated per endpoint.
 *
 * `next_page` is the whole protocol on this side: hand it back as
 * ?cursor= to get the following page, and null means there is no
 * following page. It replaces the offset arithmetic these lists used to
 * do (meta.offset + meta.limit), because a cursor already encodes a
 * position in the sort key.
 *
 * Only items/total are required by the backend's schema, so the four
 * cursor fields are nullish (absent or null) rather than nullable. */
export const cursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    current_page: z.string().nullish().default(null),
    current_page_backwards: z.string().nullish().default(null),
    previous_page: z.string().nullish().default(null),
    next_page: z.string().nullish().default(null),
  });

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
  /** Airline's own label for the seat, e.g. "Extra legroom seat", and any
   * conditions attached to it, e.g. "Do not seat children in exit rows".
   * Duffel sends both on every element but leaves them empty far more
   * often than not, so anything rendering these has to drop out cleanly
   * when they're blank rather than leave an empty heading behind.
   *
   * Both are nullable, not merely optional, because Duffel really does
   * send `null` here - on a sampled NBO-MBA seat map, `name` was null on
   * all 209 elements and `disclosures` was null on 17 of them (a list
   * elsewhere). A schema accepting only an array/undefined rejects the
   * entire seat map over those 17, so disclosures is normalised to [] to
   * spare every consumer the null check. */
  name: z.string().nullable().optional().default(null),
  disclosures: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
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

export const placeSuggestionsResponseSchema = z.object({
  data: z.array(placeSchema),
  meta: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type PlaceSuggestionsResponse = z.infer<typeof placeSuggestionsResponseSchema>;

/* ---------- booking: POST /booking/flight-orders (creates a Duffel order) ---------- */

export const paymentStatusSchema = z.object({
  awaiting_payment: z.boolean().nullable(),
  payment_required_by: z.string().nullable(),
  price_guarantee_expires_at: z.string().nullable(),
});
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

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
  conditions: conditionsSchema.nullable(),
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

/** Mirrors backend/schemas/refunds.py's CancellationRefundPreview. Kept
 * distinct from the Duffel quote it arrives beside because they are
 * genuinely different numbers: the quote's refund_amount returns to
 * flyt's Duffel balance, while this is what the customer receives. The
 * backend computes it (crud/refunds.py) so nothing here has to redo that
 * arithmetic and risk quoting a figure that never gets paid. */
export const cancellationRefundPreviewSchema = z.object({
  amount: z.string(),
  currency: z.string(),
  to_original_payment_method: z.boolean(),
  manual_payout_reason: z.string().nullable(),
});
export type CancellationRefundPreview = z.infer<typeof cancellationRefundPreviewSchema>;

export const orderCancellationQuoteResponseSchema = z.object({
  data: orderCancellationQuoteSchema,
  customer_refund: cancellationRefundPreviewSchema,
});
export type OrderCancellationQuoteResponse = z.infer<
  typeof orderCancellationQuoteResponseSchema
>;

/** Mirrors backend/schemas/refunds.py's CustomerRefundRead - deliberately
 * only two states. The backend collapses failed/manual_required into
 * "processing" because a traveller can act on neither; see that file. */
export const customerRefundSchema = z.object({
  amount: z.string(),
  currency: z.string(),
  status: z.enum(["processing", "paid"]),
  created_at: z.string(),
});
export type CustomerRefund = z.infer<typeof customerRefundSchema>;

/** Mirrors backend/schemas/refunds.py's RefundRead - the full internal
 * view, staff only. */
export const refundStatusSchema = z.enum([
  "requested",
  "failed",
  "manual_required",
  "completed",
]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const refundReadSchema = z.object({
  id: z.string(),
  payment_id: z.string(),
  booking_id: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  status: refundStatusSchema,
  failure_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RefundRead = z.infer<typeof refundReadSchema>;
export const refundPageSchema = cursorPageSchema(refundReadSchema);
export type RefundPage = z.infer<typeof refundPageSchema>;

/* ---------- order changes: POST .../change-requests, .../changes (backend/schemas/duffel_orders.py) ---------- */

export const orderChangeRequestSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  live_mode: z.boolean().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export const orderChangeRequestResponseSchema = z.object({ data: orderChangeRequestSchema });
export type OrderChangeRequestResponse = z.infer<typeof orderChangeRequestResponseSchema>;

export const orderChangeOfferSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string().nullable(),
  change_total_amount: z.string().nullable(),
  change_total_currency: z.string().nullable(),
  new_total_amount: z.string().nullable(),
  new_total_currency: z.string().nullable(),
  penalty_total_amount: z.string().nullable(),
  penalty_total_currency: z.string().nullable(),
  refund_to: z.string().nullable(),
  live_mode: z.boolean().nullable(),
});
export type OrderChangeOffer = z.infer<typeof orderChangeOfferSchema>;

export const orderChangeOffersResponseSchema = z.object({
  data: z.object({ offers: z.array(orderChangeOfferSchema).default([]) }),
});
export type OrderChangeOffersResponse = z.infer<typeof orderChangeOffersResponseSchema>;

export const orderChangeSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  change_total_amount: z.string().nullable(),
  change_total_currency: z.string().nullable(),
  new_total_amount: z.string().nullable(),
  new_total_currency: z.string().nullable(),
  penalty_total_amount: z.string().nullable(),
  penalty_total_currency: z.string().nullable(),
  refund_to: z.string().nullable(),
});
export type OrderChange = z.infer<typeof orderChangeSchema>;

export const orderChangeResponseSchema = z.object({ data: orderChangeSchema });
export type OrderChangeResponse = z.infer<typeof orderChangeResponseSchema>;

/* ---------- our own bookings: GET /booking/flight-orders (backend/schemas/bookings.py) ---------- */

export const flightPublicSchema = z.object({
  id: z.string(),
  duffel_segment_id: z.string(),
  origin_iata_code: z.string(),
  origin_name: z.string().nullable(),
  origin_terminal: z.string().nullable(),
  destination_iata_code: z.string(),
  destination_name: z.string().nullable(),
  destination_terminal: z.string().nullable(),
  departing_at: z.string(),
  arriving_at: z.string(),
  duration: z.string().nullable(),
  marketing_carrier_iata_code: z.string().nullable(),
  marketing_carrier_name: z.string().nullable(),
  marketing_carrier_logo_url: z.string().nullable(),
  marketing_carrier_flight_number: z.string().nullable(),
  operating_carrier_iata_code: z.string().nullable(),
  operating_carrier_name: z.string().nullable(),
  operating_carrier_flight_number: z.string().nullable(),
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

export const ticketPublicSchema = z.object({
  id: z.string(),
  document_type: z.string(),
  ticket_number: z.string(),
  issued_at: z.string(),
});
export type TicketPublic = z.infer<typeof ticketPublicSchema>;

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
  checked_bags: z.number().default(0),
  carry_on_bags: z.number().default(0),
  tickets: z.array(ticketPublicSchema),
});
export type BookingPassengerPublic = z.infer<typeof bookingPassengerPublicSchema>;

export const bookingPublicSchema = z.object({
  id: z.string(),
  duffel_order_id: z.string(),
  booking_reference: z.string(),
  status: bookingStatusSchema,
  total_amount: z.string(),
  total_currency: z.string(),
  base_amount: z.string().nullable(),
  base_currency: z.string().nullable(),
  tax_amount: z.string().nullable(),
  tax_currency: z.string().nullable(),
  owner_iata_code: z.string().nullable(),
  owner_name: z.string().nullable(),
  refund_allowed: z.boolean().nullable(),
  refund_penalty_amount: z.string().nullable(),
  refund_penalty_currency: z.string().nullable(),
  change_allowed: z.boolean().nullable(),
  change_penalty_amount: z.string().nullable(),
  change_penalty_currency: z.string().nullable(),
  created_at: z.string(),
  cancelled_at: z.string().nullable(),
  airline_initiated_change_detected_at: z.string().nullable(),
  slices: z.array(bookingSlicePublicSchema),
  passengers: z.array(bookingPassengerPublicSchema),
});
export type BookingPublic = z.infer<typeof bookingPublicSchema>;

export const bookingPageSchema = cursorPageSchema(bookingPublicSchema);
export type BookingPage = z.infer<typeof bookingPageSchema>;

/* ---------- admin: mirrors backend/schemas/admin.py, backend/schemas/bookings.py's PopularRoute ---------- */

export const popularRouteSchema = z.object({
  origin_iata_code: z.string(),
  origin_city_name: z.string().nullable(),
  destination_iata_code: z.string(),
  destination_city_name: z.string().nullable(),
  booking_count: z.number(),
  // Unsplash photo - all three null together whenever
  // scripts/backfill_destination_images.py hasn't cached one yet.
  // destination_image_attribution_name/_url must be rendered as a
  // visible credit next to the image, per Unsplash's API guidelines.
  destination_image_url: z.string().nullable(),
  destination_image_attribution_name: z.string().nullable(),
  destination_image_attribution_url: z.string().nullable(),
});
export type PopularRoute = z.infer<typeof popularRouteSchema>;

export const popularRouteListSchema = z.array(popularRouteSchema);

export const currencyTotalSchema = z.object({
  currency: z.string(),
  total_amount: z.string(),
});
export type CurrencyTotal = z.infer<typeof currencyTotalSchema>;

/* ---------- concierge: mirrors backend/schemas/concierge.py's FlightCard.
 * Arrives via the AI SDK's tool-output stream (ConciergeWidget.tsx), not
 * client.ts's usual fetch - still parsed through zod before rendering,
 * same "don't trust a network boundary" discipline as everywhere else. ---------- */

export const conciergeFlightCardSchema = z.object({
  offer_id: z.string(),
  origin_iata_code: z.string(),
  origin_city_name: z.string().nullable(),
  destination_iata_code: z.string(),
  destination_city_name: z.string().nullable(),
  departing_at: z.string(),
  arriving_at: z.string(),
  duration: z.string().nullable(),
  stops: z.number(),
  airline_name: z.string().nullable(),
  airline_logo_url: z.string().nullable(),
  total_amount: z.string(),
  total_currency: z.string(),
});
export type ConciergeFlightCard = z.infer<typeof conciergeFlightCardSchema>;

/** Mirrors backend/schemas/concierge.py's BookingSummary/CancellationQuote/
 * ChangeOption - output of the concierge's booking-management tools
 * (get_my_booking, get_cancellation_quote, confirm_cancellation,
 * search_change_options). */
export const conciergeBookingSummarySchema = z.object({
  booking_reference: z.string(),
  status: bookingStatusSchema,
  origin_iata_code: z.string(),
  destination_iata_code: z.string(),
  departing_at: z.string(),
  total_amount: z.string(),
  total_currency: z.string(),
});
export type ConciergeBookingSummary = z.infer<typeof conciergeBookingSummarySchema>;

export const conciergeCancellationQuoteSchema = z.object({
  cancellation_id: z.string(),
  refund_amount: z.string().nullable(),
  refund_currency: z.string().nullable(),
  expires_at: z.string().nullable(),
  confirmed: z.boolean(),
});
export type ConciergeCancellationQuote = z.infer<typeof conciergeCancellationQuoteSchema>;

export const conciergeChangeOptionSchema = z.object({
  change_offer_id: z.string(),
  change_total_amount: z.string().nullable(),
  change_total_currency: z.string().nullable(),
  penalty_total_amount: z.string().nullable(),
  penalty_total_currency: z.string().nullable(),
});
export type ConciergeChangeOption = z.infer<typeof conciergeChangeOptionSchema>;

export const adminDashboardSummarySchema = z.object({
  total_bookings: z.number(),
  bookings_today: z.number(),
  bookings_this_week: z.number(),
  total_users: z.number(),
  active_users: z.number(),
  revenue: z.array(currencyTotalSchema),
});
export type AdminDashboardSummary = z.infer<typeof adminDashboardSummarySchema>;

export const adminUserReadSchema = z.object({
  id: z.string(),
  email: z.string(),
  is_staff: z.boolean(),
  is_superuser: z.boolean(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
  banned_at: z.string().nullable(),
  banned_reason: z.string().nullable(),
});
export type AdminUserRead = z.infer<typeof adminUserReadSchema>;

export const adminUserPageSchema = cursorPageSchema(adminUserReadSchema);
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

/** GET /api/admin/users/{userId} only - group_ids/banned_by_email would
 * mean an extra query per row if they were on adminUserReadSchema
 * instead (see backend/schemas/admin.py's AdminUserDetail docstring). */
export const adminUserDetailSchema = adminUserReadSchema.extend({
  group_ids: z.array(z.number()),
  banned_by_email: z.string().nullable(),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const adminBookingReadSchema = bookingPublicSchema.extend({
  user_id: z.string(),
  user_email: z.string(),
});
export type AdminBookingRead = z.infer<typeof adminBookingReadSchema>;

export const adminBookingPageSchema = cursorPageSchema(adminBookingReadSchema);
export type AdminBookingPage = z.infer<typeof adminBookingPageSchema>;

/* ---------- RBAC: mirrors backend/schemas/rbac.py - groups/permissions
 * management, superuser-only on the backend (utils/rbac.py's
 * require_superuser) ---------- */

export const adminPermissionReadSchema = z.object({
  codename: z.string(),
  name: z.string(),
  content_type: z.string(),
});
export type AdminPermissionRead = z.infer<typeof adminPermissionReadSchema>;

export const adminGroupReadSchema = z.object({
  id: z.number(),
  name: z.string(),
  permissions: z.array(z.string()),
});
export type AdminGroupRead = z.infer<typeof adminGroupReadSchema>;

/* ---------- pricing: mirrors backend/schemas/admin.py's PricingSaleRead/
 * DiscountCodeRead - staff-only sale/markup override + discount-code
 * management (backend/crud/pricing.py). ---------- */

export const pricingSaleReadSchema = z.object({
  id: z.string(),
  name: z.string(),
  markup_rate: z.number(),
  starts_at: z.string(),
  ends_at: z.string(),
  created_by_user_id: z.string(),
  created_at: z.string(),
});
export type PricingSaleRead = z.infer<typeof pricingSaleReadSchema>;

export const discountCodeReadSchema = z.object({
  id: z.string(),
  code: z.string(),
  discount_percentage: z.number(),
  max_redemptions: z.number().nullable(),
  times_redeemed: z.number(),
  expires_at: z.string().nullable(),
  is_active: z.boolean(),
  created_by_user_id: z.string(),
  created_at: z.string(),
});
export type DiscountCodeRead = z.infer<typeof discountCodeReadSchema>;

/* ---------- payment: POST /payments/checkout, GET /payments/{id}/status ---------- */

export const paymentStatusEnumSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "booking_failed",
]);
export type PaymentStatusEnum = z.infer<typeof paymentStatusEnumSchema>;

export const checkoutResponseSchema = z.object({
  payment_id: z.string(),
  redirect_url: z.string(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/** POST /payments/checkout/card — Duffel Payments alternative to Pesapal. */
export const cardCheckoutResponseSchema = z.object({
  payment_id: z.string(),
  client_token: z.string(),
});
export type CardCheckoutResponse = z.infer<typeof cardCheckoutResponseSchema>;

export const paymentStatusResponseSchema = z.object({
  id: z.string(),
  status: paymentStatusEnumSchema,
  booking_id: z.string().nullable(),
  failure_reason: z.string().nullable(),
  booking: bookingPublicSchema.nullable(),
});
export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;

/** POST /discounts/preview — a lightweight, non-persisting check so the
 * customer sees whether a code works (and roughly what it saves) before
 * committing to checkout; the real checkout call is authoritative. */
export const discountPreviewResponseSchema = z.object({
  original_amount: z.string(),
  discounted_amount: z.string(),
  currency: z.string(),
  discount_percentage: z.number(),
});
export type DiscountPreviewResponse = z.infer<typeof discountPreviewResponseSchema>;

/* ---------- notifications: mirrors backend/schemas/notifications.py -
 * bell icon, GET /notifications/stream (SSE) + REST list/mark-read.
 * Works identically for a customer or staff/admin account - which type
 * of event a given user receives is decided server-side (backend/crud/
 * notifications.py), not by this schema. ---------- */

export const notificationTypeSchema = z.enum([
  "booking_confirmed",
  "booking_failed",
  "airline_change",
  "cancellation_confirmed",
  "change_confirmed",
  "departure_reminder",
  "support_request",
  "discount_redemption_failed",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationReadSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  link_url: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationRead = z.infer<typeof notificationReadSchema>;

/** No unread_count here: GET /notifications/unread-count is the single
 * source for the badge, and the list endpoint no longer recomputes it. */
export const notificationPageSchema = cursorPageSchema(notificationReadSchema);
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const unreadCountResponseSchema = z.object({ unread_count: z.number() });
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
