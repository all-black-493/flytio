/**
 * Mirrors backend/schemas/duffel_flights.py exactly (field names, nesting,
 * snake_case) so this UI can be pointed at the real API later by swapping
 * the mock functions in `mockFlights.ts` for real fetch calls.
 */

export type CabinClass = 'first' | 'business' | 'premium_economy' | 'economy';

export type Airport = {
  iata_code: string | null;
  name: string | null;
  city_name: string | null;
};

export type Carrier = {
  iata_code: string | null;
  name: string | null;
};

export type OfferSegment = {
  id: string;
  origin: Airport;
  destination: Airport;
  departing_at: string;
  arriving_at: string;
  duration: string | null;
  marketing_carrier: Carrier | null;
  marketing_carrier_flight_number: string | null;
};

export type OfferSlice = {
  id: string;
  origin: Airport;
  destination: Airport;
  duration: string | null;
  segments: OfferSegment[];
};

export type OfferPassenger = {
  id: string;
  type: 'adult' | 'child' | 'infant_without_seat' | null;
};

export type Offer = {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: Carrier | null;
  slices: OfferSlice[];
  passengers: OfferPassenger[];
};

export type SeatElement = {
  designator: string;
  available: boolean;
};

export type SeatCabin = {
  cabin_class: CabinClass;
  rowLabel: string;
  seats: SeatElement[];
};

export type Order = {
  id: string;
  booking_reference: string;
  total_amount: string;
  total_currency: string;
  owner: Carrier | null;
  slices: OfferSlice[];
  passengers: { given_name: string; family_name: string }[];
};
