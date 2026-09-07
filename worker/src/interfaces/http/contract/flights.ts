import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  flightSearchAndListQuery,
  flightSearchResponse,
  offerListQuery,
  offerRequestCreate,
} from "@interfaces/http/schemas";

export const flightsContract = {
  /**
   * Detailed input structure, not compact: compact merges the path with
   * either the query or the body depending on the method, so on a POST the
   * filter/sort/page parameters would never be read.
   */
  search: oc
    .route({
      method: "POST",
      path: "/shopping/flight-offers",
      inputStructure: "detailed",
      tags: ["Flights"],
      summary: "Search for flights",
    })
    .input(z.object({ query: offerListQuery, body: offerRequestCreate }))
    .output(flightSearchResponse),

  searchByQuery: oc
    .route({
      method: "GET",
      path: "/shopping/flight-offers",
      tags: ["Flights"],
      summary: "Search for flights by query parameters",
    })
    .input(flightSearchAndListQuery)
    .output(flightSearchResponse),
};
