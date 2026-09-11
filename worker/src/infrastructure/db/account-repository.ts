import { Client } from "pg";
import type { AccountRepository } from "@application/ports";
import type { Account } from "@domain/auth/account";

/**
 * password_changed_at comes back as epoch seconds rather than a timestamp.
 * The column is `timestamp without time zone` holding UTC, and node-postgres
 * would read it in the server's local zone - correct only by accident. The
 * cast in SQL reads it as UTC, which is what Python wrote.
 */
const BY_EMAIL = `
  SELECT
    id::text,
    email,
    is_staff,
    is_superuser,
    deleted_at,
    banned_at,
    EXTRACT(EPOCH FROM password_changed_at)::bigint AS password_changed_at_epoch
  FROM userindb
  WHERE email = $1
  LIMIT 1
`;

type Row = {
  id: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  deleted_at: Date | null;
  banned_at: Date | null;
  password_changed_at_epoch: string | null;
};

export function postgresAccountRepository(connectionString: string): AccountRepository {
  return {
    async byEmail(email: string): Promise<Account | null> {
      const client = new Client({ connectionString });
      try {
        await client.connect();
        const row = (await client.query<Row>(BY_EMAIL, [email])).rows[0];
        if (!row) return null;

        return {
          id: row.id,
          email: row.email,
          isStaff: row.is_staff,
          isSuperuser: row.is_superuser,
          deletedAt: row.deleted_at,
          bannedAt: row.banned_at,
          passwordChangedAtEpoch:
            row.password_changed_at_epoch === null ? null : Number(row.password_changed_at_epoch),
        };
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}
