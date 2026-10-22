import { AUTH_COOKIE_NAME } from "@interfaces/http/credentials";

export type CookiePolicy = {
  /** The shared parent domain in production, so the API and the app both see it. */
  domain: string | null;
  secure: boolean;
  lifetimeMinutes: number;
};

/**
 * Byte-for-byte what Starlette emits for this cookie today - verified against
 * it for both the local and production settings - so a browser cannot tell
 * which service answered and sessions survive the cutover.
 */
export function sessionCookie(token: string, policy: CookiePolicy): string {
  return [
    `${AUTH_COOKIE_NAME}=${token}`,
    ...(policy.domain ? [`Domain=${policy.domain}`] : []),
    "HttpOnly",
    `Max-Age=${policy.lifetimeMinutes * 60}`,
    "Path=/",
    "SameSite=lax",
    ...(policy.secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Equivalent to Starlette's delete_cookie rather than identical to it: that
 * one stamps the current time into `expires`, which is not worth reproducing.
 * Max-Age=0 is what actually clears the cookie in every browser that matters.
 */
export function clearedSessionCookie(policy: Pick<CookiePolicy, "domain">): string {
  return [
    `${AUTH_COOKIE_NAME}=`,
    ...(policy.domain ? [`Domain=${policy.domain}`] : []),
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "Path=/",
    "SameSite=lax",
  ].join("; ");
}
