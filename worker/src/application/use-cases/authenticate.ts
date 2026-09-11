import type { AccountRepository, TokenVerifier } from "@application/ports";
import type { Account } from "@domain/auth/account";
import { isUsable } from "@domain/auth/account";
import { isAccessToken, survivedPasswordChange } from "@domain/auth/access-token";

/**
 * Who is asking. Null covers every way a credential can fail to identify
 * somebody - unsigned, expired, wrong purpose, unknown, deleted, banned,
 * outlived by a password reset - because the caller answers all of them the
 * same way, and a caller that could tell them apart would leak which.
 */
export async function authenticate(
  // Only the lookup it uses: recognising a session has no business with a
  // password hash, and saying so here keeps it that way.
  deps: { tokens: TokenVerifier; accounts: Pick<AccountRepository, "byEmail"> },
  credential: string | null,
): Promise<Account | null> {
  if (!credential) return null;

  const claims = await deps.tokens.verify(credential);
  if (!claims || !isAccessToken(claims)) return null;

  const account = await deps.accounts.byEmail(claims.sub!);
  if (!account || !isUsable(account)) return null;

  return survivedPasswordChange(claims, account) ? account : null;
}
