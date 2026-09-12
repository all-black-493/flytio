import { Client } from "pg";
import type { BookingRepository } from "@application/ports";
import type { Booking, BookingFilters } from "@domain/bookings/booking";
import { keysetPage, type KeysetPage } from "@domain/pagination/keyset";

/**
 * The whole nested record is assembled in Postgres rather than stitched from
 * four result sets. Each query from a Worker is a network round trip through
 * Hyperdrive, and a booking page is four levels deep.
 *
 * Ordering inside a booking is stated here rather than left to the planner:
 * flights by when they leave, slices by when they start, so a return trip
 * reads outbound-first. The service this replaces declares no order at all
 * and happens to get insertion order.
 */
/**
 * Timestamps come back as text, not as values the driver parses. The columns
 * are `timestamp without time zone` holding UTC, and node-postgres reads
 * those in the server's local zone - a booking stored at 03:13 came back as
 * 00:13Z, with the microseconds rounded off. Microseconds matter twice here:
 * the keyset cursor is built from created_at, and the app compares these
 * strings to what the Python service emits.
 *
 * The shape is datetime.isoformat(): no zone, and a fractional part only when
 * there is one.
 */
function isoText(column: string): string {
  return `CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN date_part('microsecond', ${column})::bigint % 1000000 = 0
      THEN to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS')
    ELSE to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US')
  END`;
}

/**
 * SQLAlchemy stores a Python enum by NAME, so the column holds CONFIRMED
 * while every reader expects the value, "confirmed".
 */
function enumText(column: string): string {
  return `lower(${column}::text)`;
}

const BOOKING_COLUMNS = `
    b.id::text,
    b.duffel_order_id,
    b.booking_reference,
    ${enumText("b.status")} AS status,
    b.total_amount,
    b.total_currency,
    b.base_amount,
    b.base_currency,
    b.tax_amount,
    b.tax_currency,
    b.owner_iata_code,
    b.owner_name,
    b.refund_allowed,
    b.refund_penalty_amount,
    b.refund_penalty_currency,
    b.change_allowed,
    b.change_penalty_amount,
    b.change_penalty_currency,
    ${isoText("b.created_at")} AS created_at,
    ${isoText("b.cancelled_at")} AS cancelled_at,
    ${isoText("b.airline_initiated_change_detected_at")} AS airline_initiated_change_detected_at,
    (
      SELECT COALESCE(jsonb_agg(slice ORDER BY slice.departs, slice.id), '[]'::jsonb)
      FROM (
        SELECT
          s.id::text,
          s.duffel_slice_id,
          s.origin_iata_code,
          s.origin_name,
          s.origin_city_name,
          s.destination_iata_code,
          s.destination_name,
          s.destination_city_name,
          s.duration,
          (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', f.id::text,
                  'duffel_segment_id', f.duffel_segment_id,
                  'origin_iata_code', f.origin_iata_code,
                  'origin_name', f.origin_name,
                  'origin_terminal', f.origin_terminal,
                  'destination_iata_code', f.destination_iata_code,
                  'destination_name', f.destination_name,
                  'destination_terminal', f.destination_terminal,
                  'departing_at', ${isoText("f.departing_at")},
                  'arriving_at', ${isoText("f.arriving_at")},
                  'duration', f.duration,
                  'marketing_carrier_iata_code', f.marketing_carrier_iata_code,
                  'marketing_carrier_name', f.marketing_carrier_name,
                  'marketing_carrier_logo_url', f.marketing_carrier_logo_url,
                  'marketing_carrier_flight_number', f.marketing_carrier_flight_number,
                  'operating_carrier_iata_code', f.operating_carrier_iata_code,
                  'operating_carrier_name', f.operating_carrier_name,
                  'operating_carrier_flight_number', f.operating_carrier_flight_number,
                  'aircraft_name', f.aircraft_name
                )
                ORDER BY f.departing_at, f.id
              ),
              '[]'::jsonb
            )
            FROM flight f WHERE f.slice_id = s.id
          ) AS flights,
          (SELECT MIN(f2.departing_at) FROM flight f2 WHERE f2.slice_id = s.id) AS departs
        FROM bookingslice s
        WHERE s.booking_id = b.id
      ) AS slice
    ) AS slices,
    (
      SELECT COALESCE(jsonb_agg(passenger ORDER BY passenger.family_name, passenger.given_name, passenger.id), '[]'::jsonb)
      FROM (
        SELECT
          p.id::text,
          p.duffel_passenger_id,
          ${enumText("p.passenger_type")} AS passenger_type,
          p.given_name,
          p.family_name,
          p.born_on,
          p.email,
          p.phone_number,
          p.seat_designator,
          ${enumText("p.cabin_class")} AS cabin_class,
          p.checked_bags,
          p.carry_on_bags,
          (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', t.id::text,
                  'document_type', t.document_type,
                  'ticket_number', t.ticket_number,
                  'issued_at', ${isoText("t.issued_at")}
                )
                ORDER BY t.issued_at, t.id
              ),
              '[]'::jsonb
            )
            FROM ticket t WHERE t.booking_passenger_id = p.id
          ) AS tickets
        FROM bookingpassenger p
        WHERE p.booking_id = b.id
      ) AS passenger
    ) AS passengers
`;

/**
 * `departs` is only there to order slices by, so it is stripped rather than
 * sent - it is not part of the record the app reads.
 */
function toBooking(row: Record<string, unknown>): Booking {
  const slices = (row.slices as Record<string, unknown>[]).map((slice) => {
    const rest = { ...slice };
    delete rest.departs;
    return rest;
  });
  return { ...row, slices } as unknown as Booking;
}

type FilterSql = { where: string; values: unknown[] };

/**
 * Origin and destination have to match the same slice, not merely appear
 * somewhere in the booking - a return trip flies both ways, so any booking
 * would otherwise match every pair of its own airports.
 *
 * EXISTS rather than a join, which is what the service this replaces uses:
 * a join multiplies the booking by its matching slices and then needs
 * DISTINCT to undo that. Here there is nothing to undo.
 */
function filterSql(accountId: string, filters: BookingFilters): FilterSql {
  const clauses = ["b.user_id = $1::uuid"];
  const values: unknown[] = [accountId];
  let next = 2;

  const placeholder = (value: unknown) => {
    values.push(value);
    return `$${next++}`;
  };

  if (filters.bookingReference) {
    clauses.push(`b.booking_reference = ${placeholder(filters.bookingReference)}`);
  }
  // The column is a Postgres enum whose labels are the Python names, so the
  // comparison happens on the same lowercased text every reader sees.
  if (filters.status) clauses.push(`${enumText("b.status")} = ${placeholder(filters.status)}`);

  if (filters.origin || filters.destination) {
    const slice = ["s_filter.booking_id = b.id"];
    if (filters.origin) slice.push(`s_filter.origin_iata_code = ${placeholder(filters.origin)}`);
    if (filters.destination) {
      slice.push(`s_filter.destination_iata_code = ${placeholder(filters.destination)}`);
    }
    clauses.push(`EXISTS (SELECT 1 FROM bookingslice s_filter WHERE ${slice.join(" AND ")})`);
  }

  return { where: clauses.join(" AND "), values };
}

export function postgresBookingRepository(connectionString: string): BookingRepository {
  async function query<T extends Record<string, unknown>>(
    sql: string,
    values: unknown[],
  ): Promise<T[]> {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return (await client.query<T>(sql, values)).rows;
    } finally {
      await client.end().catch(() => {});
    }
  }

  async function one(accountId: string, extraWhere: string, extra: unknown[]) {
    const rows = await query(
      `SELECT ${BOOKING_COLUMNS} FROM booking b WHERE b.user_id = $1::uuid AND ${extraWhere} LIMIT 1`,
      [accountId, ...extra],
    );
    return rows[0] ? toBooking(rows[0]) : null;
  }

  return {
    async pageFor(accountId, { filters, cursor, size }): Promise<KeysetPage<Booking>> {
      const { where, values } = filterSql(accountId, filters);

      // Newest first. The id breaks ties, because created_at is not unique
      // and keyset paging needs a total order or it can skip or repeat rows.
      const forward = cursor.direction === "forward";
      const seek = cursor.after
        ? ` AND (b.created_at, b.id) ${forward ? "<" : ">"} ($${values.length + 1}::timestamp, $${values.length + 2}::uuid)`
        : "";
      const seekValues = cursor.after ? [cursor.after.createdAt, cursor.after.id] : [];

      // One row past the page, so whether the list continues is known without
      // a second query. A backward read walks away from the reader, so it is
      // gathered ascending and turned around.
      const order = forward ? "DESC" : "ASC";

      const rows = await query<Record<string, unknown>>(
        `SELECT ${BOOKING_COLUMNS}
         FROM booking b
         WHERE ${where}${seek}
         ORDER BY b.created_at ${order}, b.id ${order}
         LIMIT ${size + 1}`,
        [...values, ...seekValues],
      );

      const [countRow] = await query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM booking b WHERE ${where}`,
        values,
      );

      const more = rows.length > size;
      const page = rows.slice(0, size);
      const ordered = forward ? page : [...page].reverse();

      // A cursor writes the timestamp with a space, the response body with a
      // T. Same instant, two conventions, both already in use.
      const keyOf = (booking: Booking) => ({
        createdAt: booking.created_at.replace("T", " "),
        id: booking.id,
      });

      // Reading forward, the spare row is the one after the page. Reading
      // backward, the row after the page is the one the cursor pointed at,
      // and the spare is what still lies before it.
      const rowAfter = forward
        ? more
          ? keyOf(toBooking(rows[size]!))
          : null
        : cursor.after;

      return keysetPage(ordered.map(toBooking), {
        cursor,
        total: Number(countRow?.total ?? 0),
        keyOf,
        rowAfter,
        hasPrevious: forward ? cursor.after !== null : more,
      });
    },

    byIdFor(accountId, bookingId) {
      return one(accountId, "b.id = $2::uuid", [bookingId]);
    },

    byTicketNumberFor(accountId, ticketNumber) {
      return one(
        accountId,
        "EXISTS (SELECT 1 FROM ticket t WHERE t.booking_id = b.id AND t.ticket_number = $2)",
        [ticketNumber],
      );
    },
  };
}
