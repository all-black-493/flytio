import type { Offer } from "@domain/flights/offer";
import {
  offerDurationMinutes,
  outboundArrival,
  outboundDeparture,
  totalStops,
} from "@domain/flights/offer";

export type OfferSortKey = "best" | "price" | "duration" | "departure" | "arrival";

// Price dominates because it is why people use a comparison site at all, but
// not so heavily that a 20-hour two-stop wins on being $5 cheaper.
const PRICE_WEIGHT = 0.6;
const DURATION_WEIGHT = 0.3;
const STOPS_WEIGHT = 0.1;

/**
 * Lower is better. Each axis scores how much WORSE an offer is than the best
 * offer on that axis, proportionally: 0.5 means "half again as expensive (or
 * as long) as the cheapest (or quickest) option here".
 *
 * Proportional rather than min-max normalised, which was the first attempt and
 * was wrong: min-max spreads any range over 0-1, so a $20 gap and a $500 gap
 * both score a full 1.0. That ranked a $380 twenty-hour two-stop above a $400
 * five-hour direct. Penalties cap at 1.0 so one absurd outlier cannot drag the
 * whole scale with it.
 */
function bestValueScores(offers: Offer[]): Map<string, number> {
  const prices = offers.map((o) => Number(o.total_amount));
  const durations = offers.map((o) => Math.max(offerDurationMinutes(o), 1));

  const lowest = (values: number[]) => values.reduce((a, b) => (b < a ? b : a));
  const bestPrice = lowest(prices) || 1;
  const bestDuration = lowest(durations);

  const penalty = (value: number, best: number) => Math.min(value / best - 1, 1);

  return new Map(
    offers.map((offer, i) => [
      offer.id,
      PRICE_WEIGHT * penalty(prices[i]!, bestPrice) +
        DURATION_WEIGHT * penalty(durations[i]!, bestDuration) +
        // Stops are a small absolute count, so they score against a fixed
        // scale rather than the result set - two stops is a bad itinerary
        // whether or not something worse exists alongside it.
        STOPS_WEIGHT * Math.min(totalStops(offer) / 3, 1),
    ]),
  );
}

const by = <T>(key: (offer: Offer) => T) => (a: Offer, b: Offer) => {
  const [left, right] = [key(a), key(b)];
  return left < right ? -1 : left > right ? 1 : 0;
};

export function sortOffers(offers: Offer[], sort: OfferSortKey): Offer[] {
  if (sort === "best") {
    if (offers.length === 0) return [];
    const scores = bestValueScores(offers);
    // Price breaks ties, so equal-scoring itineraries keep a defensible order.
    return [...offers].sort((a, b) => {
      const gap = (scores.get(a.id) ?? 0) - (scores.get(b.id) ?? 0);
      return gap !== 0 ? gap : Number(a.total_amount) - Number(b.total_amount);
    });
  }
  if (sort === "price") return [...offers].sort(by((o) => Number(o.total_amount)));
  if (sort === "duration") return [...offers].sort(by(offerDurationMinutes));
  // Departure and arrival both read the outbound slice only.
  if (sort === "departure") return [...offers].sort(by(outboundDeparture));
  return [...offers].sort(by(outboundArrival));
}
