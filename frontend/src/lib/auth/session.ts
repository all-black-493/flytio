import "server-only";

import { cookies } from "next/headers";

/** Must match backend/utils/security.py's COOKIE_NAME. */
const AUTH_COOKIE_NAME = "flyt_token";

/**
 * Presence-only "optimistic" auth check for Server Components (the cookie
 * is httpOnly, so this is the only signal available here). If the token is
 * actually expired/invalid, the backend still 401s the real data fetch and
 * the calling component's existing error UI handles that.
 */
export async function isAuthenticated(): Promise<boolean> {
  return (await cookies()).has(AUTH_COOKIE_NAME);
}
