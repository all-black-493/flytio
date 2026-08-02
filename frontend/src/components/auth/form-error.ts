/** fetch() rejects with TypeError("Failed to fetch") when the request never
 * reached the server (backend down, CORS, no network) — translate that into
 * something a person can act on instead of surfacing the raw message. */
export function friendlyAuthError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return "Can't reach the flyt server. Check that the backend is running and try again.";
  }
  return error instanceof Error ? error.message : fallback;
}

/** Maps backend/routers/oauth.py's callback error codes
 * (?error=<code> on the redirect back to /login) to a message a person
 * can act on. An unrecognized code (a future error the backend added
 * that this map hasn't caught up with yet) falls back to the generic
 * message rather than showing nothing or a raw code. */
export function googleAuthErrorMessage(code: string): string {
  switch (code) {
    case "email_already_registered":
      return "An account with this email already exists — sign in with your password instead.";
    case "google_auth_failed":
    default:
      return "Google sign-in failed — please try again.";
  }
}
