import type { DepartureWindow, Offer, OfferRequestSummary, SearchResult } from "@domain/flights/offer";
import { inDepartureWindow, offerDurationMinutes, offerStops, ownerCodeAndName } from "@domain/flights/offer";
import { computeFacets, type OfferFacets } from "@domain/flights/facets";
import { groupByItinerary, paginateGroups, type OfferGroup, type PaginationMeta } from "@domain/flights/grouping";
import { sortOffers, type OfferSortKey } from "@domain/flights/ranking";
import { withMarkup } from "@domain/pricing/markup";

/** How the caller wants an already-fetched offer list narrowed and paged. */
export type OfferView = {
  sort: OfferSortKey;
  airlines: string[];
  maxStops: number | null;
  priceMax: number | null;
  departWindows: DepartureWindow[];
  maxDurationMinutes: number | null;
  limit: number;
  offset: number;
};

export type FlightSearchResult = {
  data: OfferRequestSummary;
  groups: OfferGroup[];
  meta: PaginationMeta;
  facets: OfferFacets;
};

export function applyFilters(offers: Offer[], view: OfferView): Offer[] {
  return offers.filter((offer) => {
    if (view.airlines.length && !view.airlines.includes(ownerCodeAndName(offer)[0])) return false;
    if (view.maxStops !== null && offerStops(offer) > view.maxStops) return false;
    if (view.priceMax !== null && Number(offer.total_amount) > view.priceMax) return false;
    if (
      view.departWindows.length &&
      !view.departWindows.some((window) => inDepartureWindow(offer, window))
    ) {
      return false;
    }
    if (view.maxDurationMinutes !== null && offerDurationMinutes(offer) > view.maxDurationMinutes) {
      return false;
    }
    return true;
  });
}

/**
 * Facets come from the complete offer list, then filter -> sort -> group ->
 * paginate produces the page. Order matters: sorting has to run before
 * grouping, which is what decides each group's position.
 *
 * Markup is applied first so facets, filtering, sorting and the response all
 * read the same numbers.
 */
export function buildFlightSearchResult(
  result: SearchResult,
  view: OfferView,
  markupRate: number,
): FlightSearchResult {
  const offers = result.offers.map((offer) => withMarkup(offer, markupRate));
  const groups = groupByItinerary(sortOffers(applyFilters(offers, view), view.sort));
  const { page, meta } = paginateGroups(groups, view.limit, view.offset);

  return { data: result.offerRequest, groups: page, meta, facets: computeFacets(offers) };
}
