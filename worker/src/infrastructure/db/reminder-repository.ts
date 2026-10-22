import { Client } from "pg";
import type { DepartureReminderRepository, NotificationRepository, Notification } from "@application/ports";
import type { DueDeparture } from "@domain/reminders/departure";

/**
 * Aliases are quoted camelCase so a row maps straight onto DueDeparture -
 * the alternative is a rename step that has to be kept in step by hand.
 *
 * The whole selection happens in SQL, including the per-row time zone.
 *
 * Duffel's departing_at is local at its own airport with no offset, so the
 * instant it refers to depends on a column - `AT TIME ZONE f.origin_time_zone`
 * reads exactly that. The Python sweep pulled a coarse ±14h band and filtered
 * in application code on the belief that SQL could not do this; Postgres can,
 * and doing it here means the claim and the selection see the same rows.
 *
 * A zone Postgres does not recognise would abort the whole query rather than
 * skip one row, so unknown zones are excluded by name - the same outcome the
 * Python version reaches by returning None and skipping.
 */
const DUE = `
  WITH first_flight AS (
    SELECT DISTINCT ON (f.slice_id)
      f.slice_id,
      f.departing_at,
      f.origin_terminal,
      (f.departing_at AT TIME ZONE f.origin_time_zone) AS departs_at
    FROM flight f
    WHERE f.origin_time_zone IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = f.origin_time_zone)
    ORDER BY f.slice_id, f.departing_at, f.id
  )
  SELECT
    b.id::text            AS "bookingId",
    b.booking_reference   AS "bookingReference",
    b.owner_name          AS "ownerName",
    b.user_id::text       AS "userId",
    u.email,
    s.id::text            AS "sliceId",
    s.origin_iata_code    AS "originIataCode",
    s.origin_name         AS "originName",
    s.origin_city_name    AS "originCityName",
    s.destination_iata_code  AS "destinationIataCode",
    s.destination_name       AS "destinationName",
    s.destination_city_name  AS "destinationCityName",
    to_char(ff.departs_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "departsAt",
    ff.origin_terminal    AS "originTerminal",
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'marketingCarrierName', f.marketing_carrier_name,
          'marketingCarrierIataCode', f.marketing_carrier_iata_code,
          'marketingCarrierFlightNumber', f.marketing_carrier_flight_number,
          'operatingCarrierName', f.operating_carrier_name,
          'originIataCode', f.origin_iata_code,
          'originName', f.origin_name,
          'destinationIataCode', f.destination_iata_code,
          'destinationName', f.destination_name,
          'departingAt', to_char(f.departing_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'arrivingAt', to_char(f.arriving_at, 'YYYY-MM-DD"T"HH24:MI:SS')
        ) ORDER BY f.departing_at, f.id
      ), '[]'::jsonb)
      FROM flight f WHERE f.slice_id = s.id
    ) AS flights
  FROM bookingslice s
  JOIN first_flight ff ON ff.slice_id = s.id
  JOIN booking b ON b.id = s.booking_id
  JOIN userindb u ON u.id = b.user_id
  WHERE lower(b.status::text) = 'confirmed'
    AND s.departure_reminder_sent_at IS NULL
    AND u.deleted_at IS NULL
    -- Strictly ahead of now: a sweep that was down for a day must not come
    -- back and tell people to leave for a flight that has already gone.
    AND ff.departs_at > $1::timestamptz
    AND ff.departs_at <= $1::timestamptz + make_interval(hours => $2::int)
  ORDER BY ff.departs_at
`;

/** Conditional on the column still being empty: that is the whole race guard. */
const CLAIM = `
  UPDATE bookingslice
  SET departure_reminder_sent_at = $2::timestamptz
  WHERE id = $1::uuid AND departure_reminder_sent_at IS NULL
`;

const RELEASE = `UPDATE bookingslice SET departure_reminder_sent_at = NULL WHERE id = $1::uuid`;

const CREATE_NOTIFICATION = `
  INSERT INTO notification (id, user_id, type, title, body, link_url, created_at)
  VALUES (gen_random_uuid(), $1::uuid, upper($2)::notificationtype, $3, $4, $5, now())
`;

type Row = Omit<DueDeparture, "flights"> & { flights: DueDeparture["flights"] };

function connect<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  return (async () => {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return await work(client);
    } finally {
      await client.end().catch(() => {});
    }
  })();
}

export function postgresDepartureReminderRepository(
  connectionString: string,
): DepartureReminderRepository {
  return {
    async due(now: Date, leadTimeHours: number): Promise<DueDeparture[]> {
      return connect(connectionString, async (client) => {
        const result = await client.query<Row>(DUE, [now.toISOString(), leadTimeHours]);
        return result.rows;
      });
    },

    async claim(sliceId: string, at: Date): Promise<boolean> {
      return connect(connectionString, async (client) => {
        const result = await client.query(CLAIM, [sliceId, at.toISOString()]);
        return result.rowCount === 1;
      });
    },

    async release(sliceId: string): Promise<void> {
      await connect(connectionString, (client) => client.query(RELEASE, [sliceId]));
    },
  };
}

export function postgresNotificationRepository(connectionString: string): NotificationRepository {
  return {
    async create(notification: Notification): Promise<void> {
      await connect(connectionString, (client) =>
        client.query(CREATE_NOTIFICATION, [
          notification.userId,
          notification.type,
          notification.title,
          notification.body,
          notification.linkUrl,
        ]),
      );
    },
  };
}
