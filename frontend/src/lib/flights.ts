/**
 * These types mirror the backend's response models in
 * backend/schemas/flights.py (which in turn mirror the Amadeus Flight
 * Offers Search API), so components can consume POST /flights/search
 * responses unchanged once the backend is wired in. See lib/api.ts.
 */

export interface FlightEndpoint {
  iataCode: string;
  terminal?: string | null;
  at: string; // ISO 8601 local datetime
}

export interface Segment {
  id: string;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  carrierCode: string;
  number: string;
  aircraft: { code: string };
  operating: { carrierCode: string };
  duration: string; // ISO 8601, e.g. PT8H10M
  numberOfStops: number;
  blacklistedInEU: boolean;
}

export interface Itinerary {
  duration: string;
  segments: Segment[];
}

export interface Fee {
  amount: string;
  type: string;
}

export interface Price {
  currency: string;
  total: string;
  base: string;
  fees?: Fee[] | null;
  grandTotal?: string | null;
}

export interface PricingOptions {
  fareType: string[];
  includedCheckedBagsOnly: boolean;
}

export interface IncludedCheckedBags {
  quantity?: number | null;
  weight?: number | null;
  weightUnit?: string | null;
}

export interface FareDetailsBySegment {
  segmentId: string;
  cabin: string; // ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
  fareBasis: string;
  brandedFare?: string;
  class: string;
  includedCheckedBags?: IncludedCheckedBags | null;
}

export interface TravelerPricing {
  travelerId: string;
  fareOption: string;
  travelerType: string;
  price: Price;
  fareDetailsBySegment: FareDetailsBySegment[];
}

export interface FlightOffer {
  type: string;
  id: string;
  source: string;
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  isUpsellOffer?: boolean | null;
  lastTicketingDate: string;
  lastTicketingDateTime?: string | null;
  numberOfBookableSeats: number;
  itineraries: Itinerary[];
  price: Price;
  pricingOptions: PricingOptions;
  validatingAirlineCodes: string[];
  travelerPricings: TravelerPricing[];
}

export interface Dictionaries {
  locations: Record<string, { cityCode: string; countryCode: string }>;
  aircraft: Record<string, string>;
  currencies: Record<string, string>;
  carriers: Record<string, string>;
}

/** Shape of the backend's FlightSearchResponse. */
export interface FlightSearchResponse {
  meta: { count?: number } & Record<string, unknown>;
  data: FlightOffer[];
  dictionaries: Dictionaries;
}

/* ---------- display helpers ---------- */

/** "PT8H10M" → "8H 10M" */
export function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const [, h, m] = match;
  return [h && `${h}H`, m && `${m}M`].filter(Boolean).join(" ");
}

/** "2026-08-14T17:05:00" → "17:05" */
export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

export function stopsLabel(itinerary: Itinerary): string {
  const stops = itinerary.segments.length - 1;
  return stops === 0 ? "NONSTOP" : `${stops} STOP${stops > 1 ? "S" : ""}`;
}

export function offerTotal(offer: FlightOffer): string {
  return offer.price.grandTotal ?? offer.price.total;
}

export function formatMoney(amount: string, currency: string): string {
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount}`;
}

/** Carrier name with sensible fallback while dictionaries are partial. */
export function carrierName(code: string, dictionaries: Dictionaries): string {
  return dictionaries.carriers[code] ?? code;
}

export function aircraftName(code: string, dictionaries: Dictionaries): string {
  return dictionaries.aircraft[code] ?? code;
}

/* ---------- sample data (exact backend response shape) ---------- */

function offer(
  id: string,
  seats: number,
  lastTicketingDate: string,
  segments: Omit<Segment, "operating" | "blacklistedInEU" | "numberOfStops">[],
  totalDuration: string,
  base: string,
  total: string,
  fare: {
    cabin: string;
    fareBasis: string;
    brandedFare: string;
    class: string;
    bags: number;
  },
  validating: string,
): FlightOffer {
  const fullSegments: Segment[] = segments.map((s) => ({
    ...s,
    operating: { carrierCode: s.carrierCode },
    numberOfStops: 0,
    blacklistedInEU: false,
  }));
  return {
    type: "flight-offer",
    id,
    source: "GDS",
    instantTicketingRequired: false,
    nonHomogeneous: false,
    oneWay: false,
    lastTicketingDate,
    numberOfBookableSeats: seats,
    itineraries: [{ duration: totalDuration, segments: fullSegments }],
    price: {
      currency: "EUR",
      total,
      base,
      fees: [{ amount: "0.00", type: "TICKETING" }],
      grandTotal: total,
    },
    pricingOptions: { fareType: ["PUBLISHED"], includedCheckedBagsOnly: false },
    validatingAirlineCodes: [validating],
    travelerPricings: [
      {
        travelerId: "1",
        fareOption: "STANDARD",
        travelerType: "ADULT",
        price: { currency: "EUR", total, base },
        fareDetailsBySegment: fullSegments.map((s) => ({
          segmentId: s.id,
          cabin: fare.cabin,
          fareBasis: fare.fareBasis,
          brandedFare: fare.brandedFare,
          class: fare.class,
          includedCheckedBags: { quantity: fare.bags },
        })),
      },
    ],
  };
}

export const sampleResponse: FlightSearchResponse = {
  meta: { count: 5 },
  data: [
    offer(
      "1",
      7,
      "2026-08-12",
      [
        {
          id: "1",
          departure: { iataCode: "OSL", terminal: "1", at: "2026-08-14T17:05:00" },
          arrival: { iataCode: "JFK", terminal: "7", at: "2026-08-14T19:15:00" },
          carrierCode: "N0",
          number: "701",
          aircraft: { code: "789" },
          duration: "PT8H10M",
        },
      ],
      "PT8H10M",
      "281.00",
      "348.40",
      { cabin: "ECONOMY", fareBasis: "OLXR26", brandedFare: "LIGHT", class: "O", bags: 0 },
      "N0",
    ),
    offer(
      "2",
      4,
      "2026-08-13",
      [
        {
          id: "2",
          departure: { iataCode: "OSL", terminal: "1", at: "2026-08-14T10:30:00" },
          arrival: { iataCode: "HEL", terminal: "2", at: "2026-08-14T13:05:00" },
          carrierCode: "AY",
          number: "916",
          aircraft: { code: "32N" },
          duration: "PT1H35M",
        },
        {
          id: "3",
          departure: { iataCode: "HEL", terminal: "2", at: "2026-08-14T14:40:00" },
          arrival: { iataCode: "JFK", terminal: "8", at: "2026-08-14T16:20:00" },
          carrierCode: "AY",
          number: "105",
          aircraft: { code: "359" },
          duration: "PT8H40M",
        },
      ],
      "PT11H50M",
      "212.00",
      "389.20",
      {
        cabin: "ECONOMY",
        fareBasis: "RNNOWFI",
        brandedFare: "ECONOMY CLASSIC",
        class: "R",
        bags: 1,
      },
      "AY",
    ),
    offer(
      "3",
      9,
      "2026-08-13",
      [
        {
          id: "4",
          departure: { iataCode: "OSL", terminal: "1", at: "2026-08-14T07:55:00" },
          arrival: { iataCode: "CPH", terminal: "3", at: "2026-08-14T09:05:00" },
          carrierCode: "SK",
          number: "1461",
          aircraft: { code: "32N" },
          duration: "PT1H10M",
        },
        {
          id: "5",
          departure: { iataCode: "CPH", terminal: "3", at: "2026-08-14T10:45:00" },
          arrival: { iataCode: "JFK", terminal: "1", at: "2026-08-14T13:30:00" },
          carrierCode: "SK",
          number: "909",
          aircraft: { code: "333" },
          duration: "PT8H45M",
        },
      ],
      "PT11H35M",
      "228.00",
      "412.53",
      {
        cabin: "ECONOMY",
        fareBasis: "KSKSGOLI",
        brandedFare: "SAS GO LIGHT",
        class: "K",
        bags: 0,
      },
      "SK",
    ),
    offer(
      "4",
      2,
      "2026-08-12",
      [
        {
          id: "6",
          departure: { iataCode: "OSL", terminal: "1", at: "2026-08-14T06:10:00" },
          arrival: { iataCode: "FRA", terminal: "1", at: "2026-08-14T08:25:00" },
          carrierCode: "LH",
          number: "861",
          aircraft: { code: "32N" },
          duration: "PT2H15M",
        },
        {
          id: "7",
          departure: { iataCode: "FRA", terminal: "1", at: "2026-08-14T10:00:00" },
          arrival: { iataCode: "JFK", terminal: "1", at: "2026-08-14T12:30:00" },
          carrierCode: "LH",
          number: "400",
          aircraft: { code: "359" },
          duration: "PT8H30M",
        },
      ],
      "PT12H20M",
      "251.00",
      "455.87",
      {
        cabin: "ECONOMY",
        fareBasis: "K03CLSE0",
        brandedFare: "ECONOMY CLASSIC",
        class: "K",
        bags: 1,
      },
      "LH",
    ),
    offer(
      "5",
      3,
      "2026-08-13",
      [
        {
          id: "8",
          departure: { iataCode: "OSL", terminal: "1", at: "2026-08-14T07:55:00" },
          arrival: { iataCode: "CPH", terminal: "3", at: "2026-08-14T09:05:00" },
          carrierCode: "SK",
          number: "1461",
          aircraft: { code: "32N" },
          duration: "PT1H10M",
        },
        {
          id: "9",
          departure: { iataCode: "CPH", terminal: "3", at: "2026-08-14T10:45:00" },
          arrival: { iataCode: "JFK", terminal: "1", at: "2026-08-14T13:30:00" },
          carrierCode: "SK",
          number: "909",
          aircraft: { code: "333" },
          duration: "PT8H45M",
        },
      ],
      "PT11H35M",
      "1310.00",
      "1642.00",
      {
        cabin: "BUSINESS",
        fareBasis: "DSKSBIZ",
        brandedFare: "SAS BUSINESS",
        class: "D",
        bags: 2,
      },
      "SK",
    ),
  ],
  dictionaries: {
    locations: {
      OSL: { cityCode: "OSL", countryCode: "NO" },
      CPH: { cityCode: "CPH", countryCode: "DK" },
      HEL: { cityCode: "HEL", countryCode: "FI" },
      FRA: { cityCode: "FRA", countryCode: "DE" },
      JFK: { cityCode: "NYC", countryCode: "US" },
    },
    aircraft: {
      "789": "Boeing 787-9 Dreamliner",
      "32N": "Airbus A320neo",
      "333": "Airbus A330-300",
      "359": "Airbus A350-900",
    },
    currencies: { EUR: "Euro" },
    carriers: {
      N0: "Norse Atlantic Airways",
      SK: "Scandinavian Airlines",
      AY: "Finnair",
      LH: "Lufthansa",
    },
  },
};
