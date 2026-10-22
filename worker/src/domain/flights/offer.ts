/**
 * Offers keep Duffel's field names. The Python service did too, and the
 * frontend reads them verbatim, so renaming here would only add two mapping
 * layers to keep in step. Timestamps are ISO strings: every algorithm below
 * reads them positionally or compares them lexically, never as instants.
 */

export type Airport = {
  iata_code: string | null;
  name: string | null;
  city_name: string | null;
  /** IANA name. Duffel's departing_at/arriving_at are local with no offset. */
  time_zone: string | null;
};

export type Carrier = {
  iata_code: string | null;
  name: string | null;
  logo_symbol_url: string | null;
};

export type Aircraft = {
  iata_code: string | null;
  name: string | null;
};

export type Baggage = {
  type: string;
  quantity: number;
};

/** null means Duffel does not report the condition, not that it is denied. */
export type ConditionDetail = {
  allowed: boolean | null;
  penalty_amount: string | null;
  penalty_currency: string | null;
};

export type Conditions = {
  refund_before_departure: ConditionDetail | null;
  change_before_departure: ConditionDetail | null;
};

export type OfferSliceConditions = {
  change_before_departure: ConditionDetail | null;
  priority_check_in: boolean | null;
  priority_boarding: boolean | null;
  advance_seat_selection: boolean | null;
};

export type PaymentRequirements = {
  requires_instant_payment: boolean | null;
  price_guarantee_expires_at: string | null;
  payment_required_by: string | null;
};

export type CabinAmenities = {
  seat: { pitch: string | null; legroom: string | null; type: string | null } | null;
  wifi: { available: boolean | null; cost: string | null } | null;
  power: { available: boolean | null } | null;
};

export type Cabin = {
  name: string | null;
  marketing_name: string | null;
  amenities: CabinAmenities | null;
};

export type OfferSegmentPassenger = {
  passenger_id: string;
  /** The allowance included in the fare; extra bags are available_services. */
  baggages: Baggage[];
  cabin: Cabin | null;
  cabin_class: string | null;
  cabin_class_marketing_name: string | null;
  fare_basis_code: string | null;
};

export type OfferSegment = {
  id: string;
  origin: Airport;
  destination: Airport;
  origin_terminal: string | number | null;
  destination_terminal: string | number | null;
  departing_at: string;
  arriving_at: string;
  duration: string | null;
  distance: number | null;
  marketing_carrier: Carrier | null;
  marketing_carrier_flight_number: string | null;
  operating_carrier: Carrier | null;
  operating_carrier_flight_number: string | null;
  aircraft: Aircraft | null;
  /** Technical stops within one flight number, not connections. */
  stops: Record<string, unknown>[];
  passengers: OfferSegmentPassenger[];
};

export type OfferSlice = {
  id: string;
  origin: Airport;
  destination: Airport;
  duration: string | null;
  fare_brand_name: string | null;
  conditions: OfferSliceConditions | null;
  segments: OfferSegment[];
};

export type PassengerType = "adult" | "child" | "infant_without_seat";

export type OfferPassenger = {
  id: string;
  type: PassengerType | null;
  age: number | null;
  fare_type: string | null;
};

export type AvailableService = {
  id: string;
  type: string;
  total_amount: string;
  total_currency: string;
  maximum_quantity: number;
  passenger_ids: string[];
  segment_ids: string[];
  metadata: Record<string, unknown>;
};

export type Offer = {
  id: string;
  live_mode: boolean | null;
  expires_at: string | null;
  total_amount: string;
  total_currency: string;
  base_amount: string | null;
  base_currency: string | null;
  tax_amount: string | null;
  tax_currency: string | null;
  total_emissions_kg: string | number | null;
  /** A self-transfer itinerary stitched from separate airlines' offers. */
  partial: boolean | null;
  owner: Carrier | null;
  slices: OfferSlice[];
  passengers: OfferPassenger[];
  passenger_identity_documents_required: boolean;
  supported_passenger_identity_document_types: string[];
  conditions: Conditions | null;
  payment_requirements: PaymentRequirements | null;
  available_services: AvailableService[];
};

/** Offer-request metadata; the offers themselves are paginated separately. */
export type OfferRequestSummary = {
  id: string;
  live_mode: boolean | null;
  created_at: string | null;
  passengers: OfferPassenger[];
};

export type SearchResult = {
  offerRequest: OfferRequestSummary;
  offers: Offer[];
};

const DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?$/;

function sliceDurationMinutes(duration: string | null): number {
  const match = duration ? DURATION.exec(duration) : null;
  if (!match) return 0;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function offerDurationMinutes(offer: Offer): number {
  return offer.slices.reduce((total, s) => total + sliceDurationMinutes(s.duration), 0);
}

/** The worst slice, so a round trip is not counted as its two legs combined. */
export function offerStops(offer: Offer): number {
  return offer.slices.reduce((worst, s) => Math.max(worst, s.segments.length - 1), 0);
}

export function totalStops(offer: Offer): number {
  return offer.slices.reduce((total, s) => total + Math.max(s.segments.length - 1, 0), 0);
}

export function ownerCodeAndName(offer: Offer): [string, string] {
  const code = offer.owner?.iata_code || "??";
  return [code, offer.owner?.name || code];
}

export function firstSliceSegments(offer: Offer): OfferSegment[] {
  return offer.slices[0]?.segments ?? [];
}

export function outboundDeparture(offer: Offer): string {
  return firstSliceSegments(offer)[0]?.departing_at ?? "";
}

export function outboundArrival(offer: Offer): string {
  const segments = firstSliceSegments(offer);
  return segments[segments.length - 1]?.arriving_at ?? "";
}

export type DepartureWindow = "morning" | "afternoon" | "evening" | "night";

/**
 * Local hour of the outbound leg's first departure. Duffel returns a naive
 * local timestamp per airport, which is what a traveller means by "08:00".
 */
function departureHour(offer: Offer): number | null {
  const hour = Number(outboundDeparture(offer).slice(11, 13));
  return Number.isInteger(hour) ? hour : null;
}

const WINDOWS: Record<Exclude<DepartureWindow, "night">, [number, number]> = {
  morning: [5, 12],
  afternoon: [12, 18],
  evening: [18, 22],
};

export function inDepartureWindow(offer: Offer, window: DepartureWindow): boolean {
  const hour = departureHour(offer);
  if (hour === null) return false;
  // Night is the only window that wraps midnight, so it cannot be a range.
  if (window === "night") return hour >= 22 || hour < 5;
  const [from, until] = WINDOWS[window];
  return hour >= from && hour < until;
}

/**
 * The flights an offer actually puts you on: every segment's marketing
 * carrier, number and departure. Offers sharing it are the same journey sold
 * under different fare conditions, so they belong in one card.
 *
 * Deliberately not a signature of origin/destination per slice: that is
 * identical for every offer on a point-to-point search, which collapsed a
 * live 89-offer NBO-DXB result across 8 airlines into a single group.
 */
export function itinerarySignature(offer: Offer): string {
  const parts: string[] = [];
  for (const slice of offer.slices) {
    for (const segment of slice.segments) {
      const carrier = segment.marketing_carrier?.iata_code ?? "";
      const number = segment.marketing_carrier_flight_number ?? "";
      parts.push(`${carrier}${number}@${segment.departing_at}`);
    }
    parts.push("|");
  }
  return parts.join(",");
}
