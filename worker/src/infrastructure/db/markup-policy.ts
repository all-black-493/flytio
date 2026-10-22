import { Client } from "pg";
import type { MarkupPolicy } from "@application/ports";
import { DEFAULT_MARKUP_RATE } from "@domain/pricing/markup";

/**
 * At most one sale can be active at a time - creating one rejects any overlap
 * (crud/pricing.py) - so the first row is the row.
 */
const ACTIVE_SALE = `
  SELECT markup_rate
  FROM pricingsale
  WHERE starts_at <= $1::timestamp AND ends_at >= $1::timestamp
  LIMIT 1
`;

/** The column is timestamp-without-time-zone holding UTC, as Python writes it. */
function naiveUtc(at: Date): string {
  return at.toISOString().slice(0, 23).replace("T", " ");
}

export function postgresMarkupPolicy(connectionString: string): MarkupPolicy {
  return {
    async activeRate(at: Date): Promise<number> {
      const client = new Client({ connectionString });
      try {
        await client.connect();
        const result = await client.query<{ markup_rate: number }>(ACTIVE_SALE, [naiveUtc(at)]);
        return result.rows[0]?.markup_rate ?? DEFAULT_MARKUP_RATE;
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}
