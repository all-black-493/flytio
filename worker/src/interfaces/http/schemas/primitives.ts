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

export const isoDateTime = z.iso.datetime({ offset: true }).or(z.iso.datetime());

export const isoDate = z.iso.date().describe("Calendar date, YYYY-MM-DD");

export const uuid = z.uuid();

export const money = z
  .object({ amount: decimalAmount, currency: currencyCode })
  .describe("An amount and the currency it is denominated in");

export type Money = z.infer<typeof money>;
