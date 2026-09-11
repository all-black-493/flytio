import type { AccountRepository, PasswordHasher, TokenSigner } from "@application/ports";
import { isUsable } from "@domain/auth/account";
import { accessTokenFor } from "@domain/auth/access-token";

/**
 * One refusal for every way sign-in can fail, so the response never says
 * whether an email is registered.
 *
 * It does still say so in timing: an unknown email returns before any hash is
 * checked, while a known one pays for bcrypt first. That is the behaviour of
 * the service this replaces, kept deliberately - closing it means running a
 * decoy hash on every bogus attempt, which on Workers is real CPU billed for
 * every drive-by login attempt.
 */
export async function signIn(
  deps: {
    accounts: Pick<AccountRepository, "credentialByEmail">;
    passwords: PasswordHasher;
    tokens: TokenSigner;
  },
  request: { email: string; password: string; now: Date; lifetimeMinutes: number },
): Promise<string | null> {
  const credential = await deps.accounts.credentialByEmail(request.email);
  if (!credential) return null;

  if (!(await deps.passwords.verify(request.password, credential.passwordHash))) return null;

  // A ban never scrubs the email, so the lookup above succeeds normally and
  // this is the only thing stopping a banned account from signing in.
  if (!isUsable(credential.account)) return null;

  return deps.tokens.sign(
    accessTokenFor(credential.account.email, request.now, request.lifetimeMinutes),
  );
}
