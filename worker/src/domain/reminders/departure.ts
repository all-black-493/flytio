/**
 * The departure reminder is time-triggered, not event-triggered: nothing
 * happens three hours before a flight, the clock just reaches it.
 */

/**
 * How far ahead of departure a traveller is told to get moving. A floor, not
 * a target - the sweep runs on an interval, so a reminder lands somewhere in
 * [LEAD_TIME, LEAD_TIME + interval] before departure, and never after it.
 */
export const LEAD_TIME_HOURS = 3;

/** One leg of one booking, with everything its reminder needs to be written. */
export type DueDeparture = {
  bookingId: string;
  bookingReference: string;
  ownerName: string | null;
  userId: string;
  email: string;
  sliceId: string;
  originIataCode: string;
  originName: string | null;
  originCityName: string | null;
  destinationIataCode: string;
  destinationName: string | null;
  destinationCityName: string | null;
  /** When the leg's first flight leaves, as an instant. */
  departsAt: string;
  originTerminal: string | null;
  flights: {
    marketingCarrierName: string | null;
    marketingCarrierIataCode: string | null;
    marketingCarrierFlightNumber: string | null;
    operatingCarrierName: string | null;
    originIataCode: string;
    originName: string | null;
    destinationIataCode: string;
    destinationName: string | null;
    /** Local at its own airport, with no offset - what a traveller reads. */
    departingAt: string;
    arrivingAt: string;
  }[];
};

/**
 * Whole hours to departure, for the headline. Rounded rather than floored so
 * a leg 2h50m out reads "about 3 hours" instead of "about 2", and never
 * below 1 so it cannot say "in 0 hours".
 */
export function hoursUntil(departsAt: string, now: Date): number {
  const gap = new Date(departsAt).getTime() - now.getTime();
  return Math.max(1, Math.round(gap / 3_600_000));
}
