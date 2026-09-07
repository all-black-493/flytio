export type PlaceType = "airport" | "city";

export type Place = {
  id: string;
  type: PlaceType;
  name: string;
  iataCode: string | null;
  iataCountryCode: string | null;
  iataCityCode: string | null;
  icaoCode: string | null;
  cityName: string | null;
  latitude: number | null;
  longitude: number | null;
  timeZone: string | null;
  /** Present on city-type places. */
  airports: Place[] | null;
};

/** Duffel runs one mode or the other, never both. */
export type PlaceQuery = { text: string } | { lat: number; lng: number; radiusMetres: number };
