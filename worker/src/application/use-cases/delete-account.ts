import type { AccountRepository, PasswordHasher } from "@application/ports";
import type { Account } from "@domain/auth/account";

/**
 * Requires the current password for the same reason changing it does: a
 * stolen session must not be enough to destroy the account.
 *
 * The replacement hash is a random one nobody holds - the row still needs a
 * value, and leaving the old one would keep a working credential attached to
 * an account the owner asked to be rid of.
 */
export async function deleteAccount(
  deps: { accounts: Pick<AccountRepository, "scrub">; passwords: PasswordHasher },
  request: {
    account: Account;
    passwordHash: string | null;
    password: string;
    now: Date;
  },
): Promise<boolean> {
  if (!(await deps.passwords.verify(request.password, request.passwordHash))) return false;

  await deps.accounts.scrub(
    request.account,
    await deps.passwords.hash(crypto.randomUUID()),
    request.now,
  );
  return true;
}
