import { oc } from "@orpc/contract";
import { placeSuggestionsQuery, placeSuggestionsResponse } from "@interfaces/http/schemas";

export const placesContract = {
  suggestions: oc
    .route({ method: "GET", path: "/shopping/places", tags: ["Flights"] })
    .input(placeSuggestionsQuery)
    .output(placeSuggestionsResponse),
};
