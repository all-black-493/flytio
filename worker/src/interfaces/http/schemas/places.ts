import { z } from "zod";

/** Mirrors schemas/duffel_places.py, snake_case included. */
const placeBase = z.object({
  id: z.string(),
  type: z.enum(["airport", "city"]),
  name: z.string(),
  iata_code: z.string().nullable(),
  iata_country_code: z.string().nullable(),
  iata_city_code: z.string().nullable(),
  icao_code: z.string().nullable(),
  city_name: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  time_zone: z.string().nullable(),
});

export type PlaceOut = z.infer<typeof placeBase> & { airports: PlaceOut[] | null };

export const place: z.ZodType<PlaceOut> = placeBase.extend({
  airports: z.lazy(() => z.array(place).nullable()),
});

export const placeSuggestionsResponse = z.object({
  data: z.array(place),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Duffel runs text autocomplete or a geographic radius, never both. */
export const placeSuggestionsQuery = z
  .object({
    query: z.string().min(1).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    rad: z.coerce.number().int().min(1).optional(),
  })
  .refine(
    (q) => {
      const geo = [q.lat, q.lng, q.rad];
      const anyGeo = geo.some((v) => v !== undefined);
      const allGeo = geo.every((v) => v !== undefined);
      if (q.query === undefined && !anyGeo) return false;
      if (q.query !== undefined && anyGeo) return false;
      return !anyGeo || allGeo;
    },
    { message: "Provide either `query` or `lat`+`lng`+`rad`, not both" },
  );
