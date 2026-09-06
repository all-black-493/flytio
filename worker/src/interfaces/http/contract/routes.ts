import { oc } from "@orpc/contract";
import { z } from "zod";
import { popularDestinationsQuery, popularRoute } from "@interfaces/http/schemas";

export const routesContract = {
  popularDestinations: oc
    .route({ method: "GET", path: "/flights/popular-destinations", tags: ["Flights"] })
    .input(popularDestinationsQuery)
    .output(z.array(popularRoute)),
};
