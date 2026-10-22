import { implement } from "@orpc/server";
import { listPopularDestinations } from "@application/use-cases/list-popular-destinations";
import { routesContract } from "@interfaces/http/contract/routes";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(routesContract).$context<RequestContext>();

export const routes = {
  popularDestinations: os.popularDestinations.handler(async ({ context, input }) => {
    const found = await listPopularDestinations({ routes: context.routes }, input);

    // The only work here is renaming for the wire; the shape is FastAPI's.
    return found.map((route) => ({
      origin_iata_code: route.originIataCode,
      origin_city_name: route.originCityName,
      destination_iata_code: route.destinationIataCode,
      destination_city_name: route.destinationCityName,
      booking_count: route.bookingCount,
      destination_image_url: route.destinationImage?.url ?? null,
      destination_image_attribution_name: route.destinationImage?.attributionName ?? null,
      destination_image_attribution_url: route.destinationImage?.attributionUrl ?? null,
    }));
  }),
};
