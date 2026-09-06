export type PopularRoute = {
  originIataCode: string;
  originCityName: string | null;
  destinationIataCode: string;
  destinationCityName: string | null;
  bookingCount: number;
  destinationImage: {
    url: string;
    attributionName: string | null;
    attributionUrl: string | null;
  } | null;
};

/**
 * A single booking must never read as "popular" to a customer. Staff see
 * signal from 1 booking up; this is the public bar.
 */
export const PUBLIC_POPULAR_ROUTE_MIN_BOOKINGS = 5;
