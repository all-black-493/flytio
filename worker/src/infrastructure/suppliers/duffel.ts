import type { PlaceSupplier } from "@application/ports";
import type { Place, PlaceQuery } from "@domain/places/place";

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
      const params =
        "text" in query
          ? { query: query.text }
          : { lat: String(query.lat), lng: String(query.lng), rad: String(query.radiusMetres) };

      const url = new URL("/places/suggestions", DUFFEL_BASE_URL);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Duffel-Version": DUFFEL_API_VERSION,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { errors?: [] };
        throw new DuffelError(response.status, body.errors ?? []);
      }

      const body = (await response.json()) as { data: DuffelPlace[] };
      return body.data.map(toPlace);
    },
  };
}
