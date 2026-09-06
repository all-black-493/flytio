import { z } from "zod";
import { iataCode } from "@interfaces/http/schemas/primitives";

/** Mirrors schemas/bookings.py PopularRoute, snake_case included. */
export const popularRoute = z.object({
  origin_iata_code: iataCode,
  origin_city_name: z.string().nullable(),
  destination_iata_code: iataCode,
  destination_city_name: z.string().nullable(),
  booking_count: z.number().int().nonnegative(),
  destination_image_url: z.string().nullable(),
  destination_image_attribution_name: z.string().nullable(),
  destination_image_attribution_url: z.string().nullable(),
});

export const popularDestinationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
