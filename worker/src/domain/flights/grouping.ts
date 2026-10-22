import type { Offer } from "@domain/flights/offer";
import { itinerarySignature } from "@domain/flights/offer";

export type OfferGroup = {
  primary: Offer;
  alternates: Offer[];
};

export type PaginationMeta = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

// Alternates are the same flights under different fare conditions (Basic,
// Flex, and so on), so a handful is plenty.
export const MAX_ALTERNATES_PER_GROUP = 8;

/**
 * Collapses offers that put you on the exact same flights. A group takes the
 * position of its signature's first appearance, so the caller's sort decides
 * which itinerary leads; within a group the split is always cheapest-first.
 */
export function groupByItinerary(sortedOffers: Offer[]): OfferGroup[] {
  const groups = new Map<string, Offer[]>();
  for (const offer of sortedOffers) {
    const signature = itinerarySignature(offer);
    const members = groups.get(signature);
    if (members) members.push(offer);
    else groups.set(signature, [offer]);
  }

  return [...groups.values()].map((members) => {
    const [primary, ...alternates] = [...members].sort(
      (a, b) => Number(a.total_amount) - Number(b.total_amount),
    );
    return { primary: primary!, alternates: alternates.slice(0, MAX_ALTERNATES_PER_GROUP) };
  });
}

export function paginateGroups(
  groups: OfferGroup[],
  limit: number,
  offset: number,
): { page: OfferGroup[]; meta: PaginationMeta } {
  return {
    page: groups.slice(offset, offset + limit),
    meta: { limit, offset, total: groups.length, has_more: offset + limit < groups.length },
  };
}
