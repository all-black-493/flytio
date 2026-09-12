import type {
  AccountRepository,
  Mailer,
  PasswordHasher,
  TokenSigner,
  TokenVerifier,
} from "@application/ports";
import { passwordResetTokenFor } from "@domain/auth/access-token";
import { passwordChangedNotice, passwordResetLink } from "@application/notifications";

/**
 * Deliberately says nothing about whether the address is registered. The
 * response is the same either way, which is the only thing stopping this
 * endpoint from being a membership oracle for any address somebody types.
 */
export async function requestPasswordReset(
  deps: {
    accounts: Pick<AccountRepository, "byEmail">;
    tokens: TokenSigner;
    mail: Mailer;
  },
  request: { email: string; now: Date; resetUrl: (token: string) => string },
): Promise<void> {
  const account = await deps.accounts.byEmail(request.email);
  if (!account) return;

  const token = await deps.tokens.sign(passwordResetTokenFor(account.email, request.now));
  deps.mail.send(passwordResetLink(account.email, request.resetUrl(token)));
}

export type ResetOutcome = { ok: true } | { ok: false; reason: "bad_token" };

/**
 * The token is the only proof of identity here, so its purpose is checked as
 * carefully as its signature: a login token must not double as permission to
 * change the password it was issued against.
 */
export async function resetPassword(
  deps: {
    accounts: Pick<AccountRepository, "byEmail" | "setPassword">;
    passwords: Pick<PasswordHasher, "hash">;
    tokens: TokenVerifier;
    mail: Mailer;
  },
  request: { token: string; newPassword: string; now: Date },
): Promise<ResetOutcome> {
  const claims = await deps.tokens.verify(request.token);
  if (!claims || claims.purpose !== "password_reset" || !claims.sub) {
    return { ok: false, reason: "bad_token" };
  }

  const account = await deps.accounts.byEmail(claims.sub);
  if (!account) return { ok: false, reason: "bad_token" };

  await deps.accounts.setPassword(
    account.id,
    await deps.passwords.hash(request.newPassword),
    request.now,
  );

  deps.mail.send(passwordChangedNotice(account.email));
  return { ok: true };
}
