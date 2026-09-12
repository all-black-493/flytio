import type { AccountRepository, Mailer, PasswordHasher, TokenSigner } from "@application/ports";
import type { Account } from "@domain/auth/account";
import { accessTokenFor } from "@domain/auth/access-token";
import { passwordChangedNotice } from "@application/notifications";

export type ChangePasswordOutcome =
  | { ok: true; freshToken: string }
  | { ok: false; reason: "wrong_password" };

/**
 * Requires the current password, so a hijacked cookie alone cannot lock the
 * owner out of their own account.
 *
 * Stamping password_changed_at ends every session issued before now -
 * including the one that made this request, whose token was minted at login
 * and is necessarily older. Reissuing here is what stops the browser 401ing
 * on its very next request.
 */
export async function changePassword(
  deps: {
    accounts: Pick<AccountRepository, "setPassword">;
    passwords: PasswordHasher;
    tokens: TokenSigner;
    mail: Mailer;
  },
  request: {
    account: Account;
    currentPasswordHash: string | null;
    currentPassword: string;
    newPassword: string;
    now: Date;
    lifetimeMinutes: number;
  },
): Promise<ChangePasswordOutcome> {
  const correct = await deps.passwords.verify(
    request.currentPassword,
    request.currentPasswordHash,
  );
  if (!correct) return { ok: false, reason: "wrong_password" };

  await deps.accounts.setPassword(
    request.account.id,
    await deps.passwords.hash(request.newPassword),
    request.now,
  );

  deps.mail.send(passwordChangedNotice(request.account.email));

  return {
    ok: true,
    freshToken: await deps.tokens.sign(
      accessTokenFor(request.account.email, request.now, request.lifetimeMinutes),
    ),
  };
}
