import { Client } from "pg";
import type { DiscountRepository, RefundRepository, CustomerRefund } from "@application/ports";
import type { DiscountCode } from "@domain/pricing/discount";

/** Stored uppercased, so the comparison is too rather than relying on the caller. */
const BY_CODE = `
  SELECT code, discount_percentage, max_redemptions, times_redeemed, expires_at, is_active
  FROM discountcode
  WHERE code = upper($1)
  LIMIT 1
`;

/**
 * Scoped to the owner in the same query. A refund is a payment record; which
 * booking it belongs to is not enough on its own to be allowed to read it.
 */
const REFUND_FOR_BOOKING = `
  SELECT
    r.amount,
    r.currency,
    lower(r.status::text) AS status,
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS created_at
  FROM refund r
  JOIN booking b ON b.id = r.booking_id
  WHERE r.booking_id = $2::uuid AND b.user_id = $1::uuid
  ORDER BY r.created_at DESC
  LIMIT 1
`;

type DiscountRow = {
  code: string;
  discount_percentage: number;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: Date | null;
  is_active: boolean;
};

function query<T extends Record<string, unknown>>(
  connectionString: string,
  sql: string,
  values: unknown[],
): Promise<T[]> {
  return (async () => {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return (await client.query<T>(sql, values)).rows;
    } finally {
      await client.end().catch(() => {});
    }
  })();
}

export function postgresDiscountRepository(connectionString: string): DiscountRepository {
  return {
    async byCode(code: string): Promise<DiscountCode | null> {
      const row = (await query<DiscountRow>(connectionString, BY_CODE, [code]))[0];
      if (!row) return null;

      return {
        code: row.code,
        discountPercentage: Number(row.discount_percentage),
        maxRedemptions: row.max_redemptions,
        timesRedeemed: row.times_redeemed,
        expiresAt: row.expires_at,
        isActive: row.is_active,
      };
    },
  };
}

export function postgresRefundRepository(connectionString: string): RefundRepository {
  return {
    async forBooking(accountId: string, bookingId: string): Promise<CustomerRefund | null> {
      const row = (
        await query<{ amount: string; currency: string; status: string; created_at: string }>(
          connectionString,
          REFUND_FOR_BOOKING,
          [accountId, bookingId],
        )
      )[0];
      if (!row) return null;

      return {
        amount: row.amount,
        currency: row.currency,
        // Only a human marking it so in the admin UI makes a refund "paid";
        // Pesapal has no webhook or status endpoint for one.
        status: row.status === "completed" ? "paid" : "processing",
        created_at: row.created_at,
      };
    },
  };
}
