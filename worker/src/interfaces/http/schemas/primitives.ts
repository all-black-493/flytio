import { z } from "zod";

/** The vocabulary every contract composes from. Defined once, named once in OpenAPI. */

export const iataCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a three-letter IATA code")
  .describe("IATA airport or city code, e.g. NBO");

export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be an ISO 4217 currency code")
  .describe("ISO 4217 currency, e.g. KES");

/** Decimal string, not a number: JSON numbers are doubles and fares are money. */
export const decimalAmount = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "must be a decimal amount")
  .describe("Decimal amount as a string, e.g. 668.78");

/** Duffel's per-airport times carry no offset at all, which is deliberate. */
export const isoDateTime = z.iso.datetime({ offset: true, local: true });

export const isoDate = z.iso.date().describe("Calendar date, YYYY-MM-DD");

export const uuid = z.uuid();

export const money = z
  .object({ amount: decimalAmount, currency: currencyCode })
  .describe("An amount and the currency it is denominated in");

export type Money = z.infer<typeof money>;

/**
 * A carrier designator, e.g. KQ. Deliberately looser than `iataCode`: the
 * facets this filters against report an unknown owner as "??", and clicking
 * that facet must not 422.
 */
export const airlineCode = z
  .string()
  .min(1)
  .max(3)
  .describe("Airline IATA designator, e.g. KQ");

/** Accepts what a URL carries and normalises it; `iataCode` stays strict for output. */
export const iataCodeInput = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase())
  .pipe(iataCode);

/** Rejects a departure that has already happened, same bound as the API it replaces. */
export const upcomingDate = isoDate.refine(
  (value) => value >= new Date().toISOString().slice(0, 10),
  "Date cannot be in the past",
);

/**
 * A repeated query parameter (`?airlines=KQ&airlines=ET`). A single occurrence
 * arrives as a scalar, so it is lifted rather than rejected.
 */
export function queryList<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]),
    z.array(item),
  );
}
