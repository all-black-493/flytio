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
