import { implement } from "@orpc/server";
import { searchFlights } from "@application/use-cases/search-flights";
import type { OfferRequestPlan } from "@domain/flights/offer-request";
import { planFromTrip } from "@domain/flights/offer-request";
import type { OfferView } from "@domain/flights/search";
import { flightsContract } from "@interfaces/http/contract/flights";
import type { RequestContext } from "@interfaces/http/context";
import type { FlightSearchQuery, OfferListQuery, OfferRequestCreate } from "@interfaces/http/schemas";

const os = implement(flightsContract).$context<RequestContext>();

function toView(query: OfferListQuery): OfferView {
  return {
    sort: query.sort,
    airlines: query.airlines,
    maxStops: query.max_stops ?? null,
    priceMax: query.price_max ?? null,
    departWindows: query.depart_windows,
    maxDurationMinutes: query.max_duration_minutes ?? null,
    limit: query.limit,
    offset: query.offset,
  };
}

function toPlan(body: OfferRequestCreate): OfferRequestPlan {
  return {
    slices: body.slices.map((s) => ({
      origin: s.origin,
      destination: s.destination,
      departureDate: s.departure_date,
    })),
    passengers: body.passengers.map((p) => ({ type: p.type ?? null, age: p.age ?? null })),
    cabinClass: body.cabin_class ?? null,
    maxConnections: body.max_connections ?? null,
  };
}

function toTripPlan(query: FlightSearchQuery): OfferRequestPlan {
  return planFromTrip({
    origin: query.origin,
    destination: query.destination,
    departureDate: query.departure_date,
    returnDate: query.return_date ?? null,
    adults: query.adults,
    children: query.children,
    infants: query.infants,
    cabinClass: query.cabin_class ?? null,
    maxConnections: query.max_connections ?? null,
  });
}

function deps(context: RequestContext) {
  return { flights: context.flights, cache: context.searchCache, markup: context.markup };
}

export const flights = {
  search: os.search.handler(({ context, input }) =>
    searchFlights(deps(context), {
      plan: toPlan(input.body),
      view: toView(input.query),
      at: context.clock.now(),
    }),
  ),

  searchByQuery: os.searchByQuery.handler(({ context, input }) =>
    searchFlights(deps(context), {
      plan: toTripPlan(input),
      view: toView(input),
      at: context.clock.now(),
    }),
  ),
};
