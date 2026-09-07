import { implement } from "@orpc/server";
import { suggestPlaces } from "@application/use-cases/suggest-places";
import { placesContract } from "@interfaces/http/contract/places";
import type { PlaceOut } from "@interfaces/http/schemas";
import type { Place } from "@domain/places/place";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(placesContract).$context<RequestContext>();

function toWire(place: Place): PlaceOut {
  return {
    id: place.id,
    type: place.type,
    name: place.name,
    iata_code: place.iataCode,
    iata_country_code: place.iataCountryCode,
    iata_city_code: place.iataCityCode,
    icao_code: place.icaoCode,
    city_name: place.cityName,
    latitude: place.latitude,
    longitude: place.longitude,
    time_zone: place.timeZone,
    airports: place.airports?.map(toWire) ?? null,
  };
}

export const places = {
  suggestions: os.suggestions.handler(async ({ context, input }) => {
    const query =
      input.query !== undefined
        ? { text: input.query }
        : { lat: input.lat!, lng: input.lng!, radiusMetres: input.rad! };

    const found = await suggestPlaces({ places: context.places, cache: context.cache }, query);
    return { data: found.map(toWire) };
  }),
};
