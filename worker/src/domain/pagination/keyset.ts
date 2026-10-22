/**
 * sqlakeyset's cursor format, which fastapi-pagination's CursorPage hands out
 * today. Reproduced rather than replaced so a cursor issued by either service
 * is understood by both - during the migration a reader can be paging through
 * a list when the route moves underneath them.
 *
 * Decoded, a cursor is a direction marker followed by the sort key it points
 * at, one `~`-joined `type:value` pair per ordered column:
 *
 *   >dt:2026-07-28 14:20:53.386236~uuid:46f7250c-28ce-4a82-bede-f6658cfa37c5
 *
 * `>` reads forward from that row, `<` backward. A bare `>` is the start.
 */

export type SortKey = {
  /**
   * Naive UTC with a space separator - `2026-07-28 14:20:53.386236` - which
   * is how the timestamp is written inside a cursor, not the `T` the same
   * value carries in a response body.
   */
  createdAt: string;
  id: string;
};

export type Cursor = {
  direction: "forward" | "backward";
  /** Null on a bare marker, which means "from the beginning". */
  after: SortKey | null;
};

export const FIRST_PAGE: Cursor = { direction: "forward", after: null };

function base64Encode(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function base64Decode(value: string): string | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/**
 * URL-encoded, because that is how the cursor is handed out today - padding
 * is the only part that ever needs it, so it shows up on the start marker and
 * nowhere else.
 */
export function encodeCursor(cursor: Cursor): string {
  const marker = cursor.direction === "forward" ? ">" : "<";
  const body = cursor.after
    ? `${marker}dt:${cursor.after.createdAt}~uuid:${cursor.after.id}`
    : marker;
  return encodeURIComponent(base64Encode(body));
}

/** Null for anything unreadable, so a mangled cursor is refused rather than
 * silently restarting the list somewhere the reader did not ask for. */
export function decodeCursor(encoded: string | undefined): Cursor | null {
  if (encoded === undefined) return FIRST_PAGE;

  const decoded = base64Decode(decodeURIComponent(encoded));
  if (decoded === null || decoded.length === 0) return null;

  const marker = decoded[0];
  if (marker !== ">" && marker !== "<") return null;
  const direction = marker === ">" ? "forward" : "backward";

  const body = decoded.slice(1);
  if (body === "") return { direction, after: null };

  const match = /^dt:(.+)~uuid:([0-9a-fA-F-]{36})$/.exec(body);
  if (!match) return null;

  return { direction, after: { createdAt: match[1]!, id: match[2]! } };
}

export type KeysetPage<T> = {
  items: T[];
  total: number;
  current_page: string | null;
  current_page_backwards: string | null;
  previous_page: string | null;
  next_page: string | null;
};

/**
 * Builds the four bookmarks around a page of rows.
 *
 * `next` points at the page's last row and `previous` at its first, because
 * reading on means "everything after the last one I saw". `current_page_
 * backwards` is where to stand to see this same page while reading backward,
 * which is the row immediately after it - so it exists only when one does.
 */
export function keysetPage<T>(
  rows: T[],
  options: {
    cursor: Cursor;
    total: number;
    keyOf: (row: T) => SortKey;
    /** The row immediately after the page, if the list continues past it. */
    rowAfter: SortKey | null;
    /** Whether anything precedes the page. */
    hasPrevious: boolean;
  },
): KeysetPage<T> {
  const bookmark = (direction: Cursor["direction"], row: T | undefined) =>
    row ? encodeCursor({ direction, after: options.keyOf(row) }) : null;

  return {
    items: rows,
    total: options.total,
    current_page: encodeCursor(options.cursor),
    // At the end of the list there is no row to stand on, so the bare marker
    // stands in for "from the end" - which is what a bare `<` means.
    current_page_backwards: encodeCursor({ direction: "backward", after: options.rowAfter }),
    previous_page: options.hasPrevious ? bookmark("backward", rows[0]) : null,
    next_page: options.rowAfter ? bookmark("forward", rows[rows.length - 1]) : null,
  };
}
