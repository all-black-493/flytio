/** Set by the Python service; kept so existing sessions survive the cutover. */
export const AUTH_COOKIE_NAME = "flyt_token";

/**
 * The cookie first, then a bearer header. Browsers send the cookie; the
 * Next.js server sends the header during SSR, and so does the API explorer.
 */
export function readCredential(request: Request): string | null {
  const cookie = request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (cookie) return decodeURIComponent(cookie.slice(AUTH_COOKIE_NAME.length + 1));

  const header = request.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}
