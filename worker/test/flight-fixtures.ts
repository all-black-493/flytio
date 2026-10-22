import type { Offer, OfferSegment, OfferSlice } from "../src/domain/flights/offer";

type SegmentSpec = {
  carrier?: string;
  number?: string;
  departingAt: string;
  arrivingAt: string;
};

export function segment(spec: SegmentSpec, index: number): OfferSegment {
  return {
    id: `seg_${index}`,
    origin: { iata_code: "NBO", name: null, city_name: "Nairobi", time_zone: "Africa/Nairobi" },
    destination: { iata_code: "DXB", name: null, city_name: "Dubai", time_zone: "Asia/Dubai" },
    origin_terminal: null,
    destination_terminal: null,
    departing_at: spec.departingAt,
    arriving_at: spec.arrivingAt,
    duration: null,
    distance: null,
    marketing_carrier: {
      iata_code: spec.carrier ?? "KQ",
      name: "Kenya Airways",
      logo_symbol_url: null,
    },
    marketing_carrier_flight_number: spec.number ?? "310",
    operating_carrier: null,
    operating_carrier_flight_number: null,
    aircraft: null,
    stops: [],
    passengers: [],
  };
}

export function slice(duration: string | null, segments: SegmentSpec[]): OfferSlice {
  return {
    id: "sli_1",
    origin: { iata_code: "NBO", name: null, city_name: "Nairobi", time_zone: null },
    destination: { iata_code: "DXB", name: null, city_name: "Dubai", time_zone: null },
    duration,
    fare_brand_name: null,
    conditions: null,
    segments: segments.map(segment),
  };
}

export function offer(fields: {
  id: string;
  total: string;
  owner?: { iata_code: string; name: string };
  slices?: OfferSlice[];
}): Offer {
  return {
    id: fields.id,
    live_mode: false,
    expires_at: null,
    total_amount: fields.total,
    total_currency: "USD",
    base_amount: null,
    base_currency: null,
    tax_amount: null,
    tax_currency: null,
    total_emissions_kg: null,
    partial: null,
    owner: fields.owner
      ? { ...fields.owner, logo_symbol_url: null }
      : { iata_code: "KQ", name: "Kenya Airways", logo_symbol_url: null },
    slices: fields.slices ?? [
      slice("PT5H", [{ departingAt: "2026-10-01T08:00:00", arrivingAt: "2026-10-01T13:00:00" }]),
    ],
    passengers: [],
    passenger_identity_documents_required: false,
    supported_passenger_identity_document_types: [],
    conditions: null,
    payment_requirements: null,
    available_services: [],
  };
}

export const EMPTY_VIEW = {
  sort: "price" as const,
  airlines: [] as string[],
  maxStops: null,
  priceMax: null,
  departWindows: [] as never[],
  maxDurationMinutes: null,
  limit: 20,
  offset: 0,
};
