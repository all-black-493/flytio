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
  async function findOne(sql: string, email: string): Promise<Row | undefined> {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return (await client.query<Row>(sql, [email])).rows[0];
    } finally {
      await client.end().catch(() => {});
    }
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
  };
}
