export type Account = {
  id: string;
  email: string;
  isStaff: boolean;
  isSuperuser: boolean;
  /** Set when the owner deletes the account; the row survives so bookings do. */
  deletedAt: Date | null;
  /** Set by an admin. Unlike deletion it is reversible and keeps the identity. */
  bannedAt: Date | null;
  /** Whole seconds since the epoch, to match what a JWT's `iat` can express. */
  passwordChangedAtEpoch: number | null;
};

export function isUsable(account: Account): boolean {
  return account.deletedAt === null && account.bannedAt === null;
}
