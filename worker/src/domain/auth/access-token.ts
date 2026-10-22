import type { Account } from "@domain/auth/account";

/**
 * Only a login token authenticates. A password-reset token is a validly
 * signed JWT for the same key, so without this distinction one that leaked -
 * through an email client prefetching its link, or a forwarded message -
 * would work as a full session.
 */
export type TokenPurpose = "access" | "password_reset";

export type TokenClaims = {
  sub: string | null;
  purpose: TokenPurpose | null;
  /** Seconds since the epoch. JWTs carry no finer resolution. */
  issuedAt: number | null;
  expiresAt: number | null;
};

export function isAccessToken(claims: TokenClaims): boolean {
  return claims.sub !== null && claims.purpose === "access";
}

/**
 * A password reset invalidates every token issued before it, even one that
 * has not expired, so a stolen session cannot outlive the reset made to lock
 * it out. Both sides are compared in whole seconds: `iat` has no finer
 * resolution, and a token minted in the same second as the reset would
 * otherwise look earlier than it purely from rounding.
 */
export function survivedPasswordChange(claims: TokenClaims, account: Account): boolean {
  if (account.passwordChangedAtEpoch === null || claims.issuedAt === null) return true;
  return claims.issuedAt >= account.passwordChangedAtEpoch;
}

function tokenFor(
  email: string,
  purpose: TokenPurpose,
  now: Date,
  lifetimeMinutes: number,
): TokenClaims {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return { sub: email, purpose, issuedAt, expiresAt: issuedAt + lifetimeMinutes * 60 };
}

/** What the Python service puts in a login token, minted the same way here. */
export function accessTokenFor(email: string, now: Date, lifetimeMinutes: number): TokenClaims {
  return tokenFor(email, "access", now, lifetimeMinutes);
}

/** Long enough to reach an inbox and be acted on, short enough that a
 * forwarded or prefetched link is not a standing key to the account. */
export const PASSWORD_RESET_LIFETIME_MINUTES = 30;

export function passwordResetTokenFor(email: string, now: Date): TokenClaims {
  return tokenFor(email, "password_reset", now, PASSWORD_RESET_LIFETIME_MINUTES);
}
