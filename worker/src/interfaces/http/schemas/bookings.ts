import { z } from "zod";
import { cursorPage, cursorQuery } from "@interfaces/http/schemas/pagination";
import {
  cabinClass,
  iataCode,
  iataCodeInput,
  isoDate,
  isoDateTime,
  passengerType,
  uuid,
} from "@interfaces/http/schemas/primitives";

export const bookingStatus = z.enum(["pending", "confirmed", "cancelled"]);

export const ticket = z.object({
  id: uuid,
  document_type: z.string(),
  ticket_number: z.string(),
  issued_at: isoDateTime,
});

export const bookingPassenger = z.object({
  id: uuid,
  duffel_passenger_id: z.string(),
  passenger_type: passengerType.nullable(),
  given_name: z.string(),
  family_name: z.string(),
  born_on: isoDate.nullable(),
  email: z.string().nullable(),
  phone_number: z.string().nullable(),
  seat_designator: z.string().nullable(),
  cabin_class: cabinClass.nullable(),
  checked_bags: z.number().int(),
  carry_on_bags: z.number().int(),
  tickets: z.array(ticket),
});

export const flight = z.object({
  id: uuid,
  duffel_segment_id: z.string(),
  origin_iata_code: iataCode,
  origin_name: z.string().nullable(),
  origin_terminal: z.string().nullable(),
  destination_iata_code: iataCode,
  destination_name: z.string().nullable(),
  destination_terminal: z.string().nullable(),
  departing_at: isoDateTime,
  arriving_at: isoDateTime,
  duration: z.string().nullable(),
  marketing_carrier_iata_code: z.string().nullable(),
  marketing_carrier_name: z.string().nullable(),
  marketing_carrier_logo_url: z.string().nullable(),
  marketing_carrier_flight_number: z.string().nullable(),
  operating_carrier_iata_code: z.string().nullable(),
  operating_carrier_name: z.string().nullable(),
  operating_carrier_flight_number: z.string().nullable(),
  aircraft_name: z.string().nullable(),
});

export const bookingSlice = z.object({
  id: uuid,
  duffel_slice_id: z.string(),
  origin_iata_code: iataCode,
  origin_name: z.string().nullable(),
  origin_city_name: z.string().nullable(),
  destination_iata_code: iataCode,
  destination_name: z.string().nullable(),
  destination_city_name: z.string().nullable(),
  duration: z.string().nullable(),
  flights: z.array(flight),
});

export const bookingPublic = z.object({
  id: uuid,
  duffel_order_id: z.string(),
  booking_reference: z.string(),
  status: bookingStatus,
  total_amount: z.string(),
  total_currency: z.string(),
  base_amount: z.string().nullable(),
  base_currency: z.string().nullable(),
  tax_amount: z.string().nullable(),
  tax_currency: z.string().nullable(),
  owner_iata_code: z.string().nullable(),
  owner_name: z.string().nullable(),
  refund_allowed: z.boolean().nullable(),
  refund_penalty_amount: z.string().nullable(),
  refund_penalty_currency: z.string().nullable(),
  change_allowed: z.boolean().nullable(),
  change_penalty_amount: z.string().nullable(),
  change_penalty_currency: z.string().nullable(),
  created_at: isoDateTime,
  cancelled_at: isoDateTime.nullable(),
  airline_initiated_change_detected_at: isoDateTime.nullable(),
  slices: z.array(bookingSlice),
  passengers: z.array(bookingPassenger),
});

export const bookingPage = cursorPage(bookingPublic);

export const bookingListQuery = z
  .object({
    booking_reference: z.string().optional(),
    origin: iataCodeInput.optional(),
    destination: iataCodeInput.optional(),
    status: bookingStatus.optional(),
  })
  .extend(cursorQuery.shape);
