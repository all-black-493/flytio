import bcrypt from "bcryptjs";
import type { PasswordHasher } from "@application/ports";

/**
 * Cost 12, matching every hash already in the table - a lower one here would
 * silently weaken every password changed from now on.
 */
const COST = 12;

/**
 * Pure JS, because there is no native bcrypt on Workers. A cost-12 verify is
 * ~340 ms of CPU here against ~200 ms natively, which needs the Paid plan's
 * budget - the free plan allows 10 ms per request. That cost is the reason
 * only sign-in and the password routes carry it, and why nothing else does.
 */
export function bcryptHasher(): PasswordHasher {
  return {
    async verify(plain: string, hash: string | null): Promise<boolean> {
      // A provider-only account has no hash; bcrypt throws on null rather
      // than returning false, so this cannot be left to the caller.
      if (hash === null) return false;
      return bcrypt.compare(plain, hash).catch(() => false);
    },

    hash(plain: string): Promise<string> {
      return bcrypt.hash(plain, COST);
    },
  };
}
