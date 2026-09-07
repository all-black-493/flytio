import type { Offer } from "@domain/flights/offer";
import { offerStops, ownerCodeAndName } from "@domain/flights/offer";

export type AirlineFacet = {
  code: string;
  name: string;
  count: number;
};

export type OfferFacets = {
  airlines: AirlineFacet[];
  price_min: number;
  price_max: number;
  has_direct: boolean;
  has_one_stop: boolean;
  has_multi_stop: boolean;
};

/**
 * Always run against the full, unfiltered offer list: facet counts have to
 * stay stable however the caller has narrowed or paged the results.
 */
export function computeFacets(offers: Offer[]): OfferFacets {
  const counts = new Map<string, AirlineFacet>();
  let priceMin = Infinity;
  let priceMax = 0;
  let hasDirect = false;
  let hasOneStop = false;
  let hasMultiStop = false;

  for (const offer of offers) {
    const [code, name] = ownerCodeAndName(offer);
    const entry = counts.get(code) ?? { code, name, count: 0 };
    entry.count += 1;
    counts.set(code, entry);

    const price = Number(offer.total_amount);
    priceMin = Math.min(priceMin, price);
    priceMax = Math.max(priceMax, price);

    const stops = offerStops(offer);
    if (stops === 0) hasDirect = true;
    else if (stops === 1) hasOneStop = true;
    else hasMultiStop = true;
  }

  return {
    airlines: [...counts.values()].sort((a, b) => b.count - a.count),
    price_min: priceMin === Infinity ? 0 : priceMin,
    price_max: priceMax,
    has_direct: hasDirect,
    has_one_stop: hasOneStop,
    has_multi_stop: hasMultiStop,
  };
}
