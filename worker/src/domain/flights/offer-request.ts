import type { PassengerType } from "@domain/flights/offer";

export type CabinClass = "first" | "business" | "premium_economy" | "economy";

export type SlicePlan = {
  origin: string;
  destination: string;
  /** Calendar date, YYYY-MM-DD. */
  departureDate: string;
};

/** A passenger is described by type or by exact age, never both. */
export type PassengerPlan = {
  type: PassengerType | null;
  age: number | null;
};

export type OfferRequestPlan = {
  slices: SlicePlan[];
  passengers: PassengerPlan[];
  cabinClass: CabinClass | null;
  maxConnections: number | null;
};

/**
 * The simple search everyone actually runs: one route, one or two dates, a
 * head count. Duffel has no GET search, so this becomes an offer request.
 */
export function planFromTrip(trip: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  adults: number;
  children: number;
  infants: number;
  cabinClass: CabinClass | null;
  maxConnections: number | null;
}): OfferRequestPlan {
  const slices: SlicePlan[] = [
    { origin: trip.origin, destination: trip.destination, departureDate: trip.departureDate },
  ];
  if (trip.returnDate) {
    slices.push({
      origin: trip.destination,
      destination: trip.origin,
      departureDate: trip.returnDate,
    });
  }

  const repeat = (type: PassengerType, count: number): PassengerPlan[] =>
    Array.from({ length: count }, () => ({ type, age: null }));

  return {
    slices,
    passengers: [
      ...repeat("adult", trip.adults),
      ...repeat("child", trip.children),
      ...repeat("infant_without_seat", trip.infants),
    ],
    cabinClass: trip.cabinClass,
    maxConnections: trip.maxConnections,
  };
}
