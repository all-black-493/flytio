/** fetch() rejects with TypeError("Failed to fetch") when the request never
 * reached the server (backend down, CORS, no network) — translate that into
 * something a person can act on instead of surfacing the raw message. */
export function friendlyAuthError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return "Can't reach the flyt server. Check that the backend is running and try again.";
  }
  return error instanceof Error ? error.message : fallback;
}
