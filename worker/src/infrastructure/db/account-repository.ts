import { Client } from "pg";
import type { AccountRepository, Credential } from "@application/ports";
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

const CREDENTIAL_BY_EMAIL = BY_EMAIL.replace("    id::text,", "    password,\n    id::text,");

const SET_PASSWORD = `
  UPDATE userindb
  SET password = $2, password_changed_at = $3::timestamp
  WHERE id = $1::uuid
`;

/**
 * Never a real DELETE: bookings and payments reference this row, and the
 * address is freed for reuse by replacing it rather than removing it.
 * password_changed_at ends every other session the account had open.
 */
const SCRUB = `
  UPDATE userindb
  SET email = $2, password = $3, deleted_at = $4::timestamp, password_changed_at = $4::timestamp
  WHERE id = $1::uuid
`;

/** The column is timestamp-without-time-zone holding UTC, as Python writes it. */
function naiveUtc(at: Date): string {
  return at.toISOString().slice(0, 23).replace("T", " ");
}

type Row = {
  password?: string | null;
  id: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  deleted_at: Date | null;
  banned_at: Date | null;
  password_changed_at_epoch: string | null;
};

function toAccount(row: Row): Account {
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
}

export function postgresAccountRepository(connectionString: string): AccountRepository {
  async function run<T extends Record<string, unknown>>(
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

  async function findOne(sql: string, email: string): Promise<Row | undefined> {
    return (await run<Row>(sql, [email]))[0];
  }

  return {
    async byEmail(email: string): Promise<Account | null> {
      const row = await findOne(BY_EMAIL, email);
      return row ? toAccount(row) : null;
    },

    async credentialByEmail(email: string): Promise<Credential | null> {
      const row = await findOne(CREDENTIAL_BY_EMAIL, email);
      return row ? { account: toAccount(row), passwordHash: row.password ?? null } : null;
    },

    async setPassword(accountId: string, hash: string, at: Date): Promise<void> {
      await run(SET_PASSWORD, [accountId, hash, naiveUtc(at)]);
    },

    async scrub(account: Account, placeholderHash: string, at: Date): Promise<void> {
      await run(SCRUB, [
        account.id,
        `deleted-${account.id}@flyt.africa`,
        placeholderHash,
        naiveUtc(at),
      ]);
    },
  };
}
