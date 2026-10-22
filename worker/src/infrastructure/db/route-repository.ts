import { Client } from "pg";
import type { RouteRepository } from "@application/ports";
import type { PopularRoute } from "@domain/routes/popular-route";

/**
 * Ported from crud/bookings.py get_popular_routes. A round trip's outbound
 * and return are different (origin, destination) pairs, so both count - that
 * is the grouping, not double-counting. The image join is a LEFT OUTER: no
 * cached photo is a normal state, not an error.
 */
const POPULAR_ROUTES = `
  SELECT
    bs.origin_iata_code,
    bs.origin_city_name,
    bs.destination_iata_code,
    bs.destination_city_name,
    COUNT(*)::int              AS booking_count,
    di.image_url,
    di.photographer_name,
    di.photographer_profile_url
  FROM bookingslice bs
  LEFT OUTER JOIN destinationimage di
    ON di.iata_code = bs.destination_iata_code
  GROUP BY
    bs.origin_iata_code, bs.origin_city_name,
    bs.destination_iata_code, bs.destination_city_name,
    di.iata_code, di.image_url, di.photographer_name, di.photographer_profile_url
  HAVING COUNT(*) >= $1
  ORDER BY COUNT(*) DESC
  LIMIT $2
`;

type Row = {
  origin_iata_code: string;
  origin_city_name: string | null;
  destination_iata_code: string;
  destination_city_name: string | null;
  booking_count: number;
  image_url: string | null;
  photographer_name: string | null;
  photographer_profile_url: string | null;
};

export function postgresRouteRepository(connectionString: string): RouteRepository {
  return {
    async popularRoutes({ limit, minBookings }): Promise<PopularRoute[]> {
      const client = new Client({ connectionString });
      try {
        await client.connect();
        const result = await client.query<Row>(POPULAR_ROUTES, [minBookings, limit]);
        return result.rows.map((row) => ({
          originIataCode: row.origin_iata_code,
          originCityName: row.origin_city_name,
          destinationIataCode: row.destination_iata_code,
          destinationCityName: row.destination_city_name,
          bookingCount: row.booking_count,
          destinationImage: row.image_url
            ? {
                url: row.image_url,
                attributionName: row.photographer_name,
                attributionUrl: row.photographer_profile_url,
              }
            : null,
        }));
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}
