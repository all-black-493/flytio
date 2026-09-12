/**
 * Our own record of a booking, not Duffel's. Field names match the wire
 * format the app already reads, same reasoning as offers.
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled";
export type PassengerType = "adult" | "child" | "infant_without_seat";
export type CabinClass = "first" | "business" | "premium_economy" | "economy";

export type Ticket = {
  id: string;
  document_type: string;
  ticket_number: string;
  issued_at: string;
};

export type BookingPassenger = {
  id: string;
  duffel_passenger_id: string;
  passenger_type: PassengerType | null;
  given_name: string;
  family_name: string;
  born_on: string | null;
  email: string | null;
  phone_number: string | null;
  seat_designator: string | null;
  cabin_class: CabinClass | null;
  checked_bags: number;
  carry_on_bags: number;
  tickets: Ticket[];
};

/** One booked segment. Times are local to their own airport, with no offset. */
export type Flight = {
  id: string;
  duffel_segment_id: string;
  origin_iata_code: string;
  origin_name: string | null;
  origin_terminal: string | null;
  destination_iata_code: string;
  destination_name: string | null;
  destination_terminal: string | null;
  departing_at: string;
  arriving_at: string;
  duration: string | null;
  marketing_carrier_iata_code: string | null;
  marketing_carrier_name: string | null;
  marketing_carrier_logo_url: string | null;
  marketing_carrier_flight_number: string | null;
  operating_carrier_iata_code: string | null;
  operating_carrier_name: string | null;
  operating_carrier_flight_number: string | null;
  aircraft_name: string | null;
};

/** One direction of the trip - outbound or return - with its connections. */
export type BookingSlice = {
  id: string;
  duffel_slice_id: string;
  origin_iata_code: string;
  origin_name: string | null;
  origin_city_name: string | null;
  destination_iata_code: string;
  destination_name: string | null;
  destination_city_name: string | null;
  duration: string | null;
  flights: Flight[];
};

export type Booking = {
  id: string;
  duffel_order_id: string;
  booking_reference: string;
  status: BookingStatus;
  total_amount: string;
  total_currency: string;
  base_amount: string | null;
  base_currency: string | null;
  tax_amount: string | null;
  tax_currency: string | null;
  owner_iata_code: string | null;
  owner_name: string | null;
  /** Null means the airline reports no condition, not that it is refused. */
  refund_allowed: boolean | null;
  refund_penalty_amount: string | null;
  refund_penalty_currency: string | null;
  change_allowed: boolean | null;
  change_penalty_amount: string | null;
  change_penalty_currency: string | null;
  created_at: string;
  cancelled_at: string | null;
  airline_initiated_change_detected_at: string | null;
  slices: BookingSlice[];
  passengers: BookingPassenger[];
};

/** Every list filter the bookings endpoint accepts. */
export type BookingFilters = {
  bookingReference: string | null;
  origin: string | null;
  destination: string | null;
  status: BookingStatus | null;
};
