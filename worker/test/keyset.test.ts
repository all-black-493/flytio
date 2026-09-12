import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, keysetPage, FIRST_PAGE } from "@domain/pagination/keyset";

// Captured from the running FastAPI service, which is the format this has to
// speak: base64 of ">dt:<naive timestamp>~uuid:<id>".
const REAL_NEXT =
  "PmR0OjIwMjYtMDctMjggMTQ6MjA6NTMuMzg2MjM2fnV1aWQ6NDZmNzI1MGMtMjhjZS00YTgyLWJlZGUtZjY2NThjZmEzN2M1";
const REAL_PREVIOUS =
  "PGR0OjIwMjYtMDctMjggMTQ6MTA6MDMuMzk5NjU2fnV1aWQ6NDUyOWE3ODctZjE5My00MmQwLTg5YTAtMjkwNjQ2NWZkMDMw";
const REAL_START = "Pg%3D%3D";

describe("cursor", () => {
  it("reads a forward cursor the Python service issued", () => {
    expect(decodeCursor(REAL_NEXT)).toEqual({
      direction: "forward",
      after: { createdAt: "2026-07-28 14:20:53.386236", id: "46f7250c-28ce-4a82-bede-f6658cfa37c5" },
    });
  });

  it("reads a backward cursor it issued", () => {
    expect(decodeCursor(REAL_PREVIOUS)).toMatchObject({ direction: "backward" });
  });

  it("reads the start marker, url-encoded as it arrives", () => {
    expect(decodeCursor(REAL_START)).toEqual(FIRST_PAGE);
  });

  it("issues cursors that service would recognise", () => {
    const forward = encodeCursor({
      direction: "forward",
      after: { createdAt: "2026-07-28 14:20:53.386236", id: "46f7250c-28ce-4a82-bede-f6658cfa37c5" },
    });
    expect(forward).toBe(REAL_NEXT);
    // URL-encoded, as the service hands it out: "Pg%3D%3D", not "Pg==".
    expect(encodeCursor(FIRST_PAGE)).toBe("Pg%3D%3D");
  });

  it("treats an absent cursor as the first page", () => {
    expect(decodeCursor(undefined)).toEqual(FIRST_PAGE);
  });

  it("refuses a mangled cursor rather than silently restarting the list", () => {
    // Quietly returning page one would show a reader rows they had already
    // passed, and look like the list had changed under them.
    for (const junk of ["", "!!!!", "bm90LWEtY3Vyc29y", encodeCursor(FIRST_PAGE).slice(1)]) {
      expect(decodeCursor(junk)).toBeNull();
    }
  });
});

describe("page bookmarks", () => {
  const rows = [
    { created_at: "2026-07-28 14:30:00.000000", id: "11111111-1111-1111-1111-111111111111" },
    { created_at: "2026-07-28 14:20:00.000000", id: "22222222-2222-2222-2222-222222222222" },
  ];
  const keyOf = (row: (typeof rows)[number]) => ({ createdAt: row.created_at, id: row.id });
  const after = keyOf({ created_at: "2026-07-28 14:10:00.000000", id: "33333333-3333-3333-3333-333333333333" });

  it("points next at the last row read, not the one after it", () => {
    const page = keysetPage(rows, { cursor: FIRST_PAGE, total: 8, keyOf, rowAfter: after, hasPrevious: false });
    expect(decodeCursor(page.next_page!)).toEqual({ direction: "forward", after: keyOf(rows[1]!) });
  });

  it("has no next page when nothing follows", () => {
    const page = keysetPage(rows, { cursor: FIRST_PAGE, total: 2, keyOf, rowAfter: null, hasPrevious: false });
    expect(page.next_page).toBeNull();
    // A bare backward marker, not null: at the end of the list there is no
    // row to stand on, and "<" already means "from the end".
    expect(page.current_page_backwards).toBe("PA%3D%3D");
    expect(decodeCursor(page.current_page_backwards!)).toEqual({ direction: "backward", after: null });
  });

  it("has no previous page at the start", () => {
    const page = keysetPage(rows, { cursor: FIRST_PAGE, total: 8, keyOf, rowAfter: after, hasPrevious: false });
    expect(page.previous_page).toBeNull();
    expect(page.current_page).toBe("Pg%3D%3D");
  });

  it("points previous at the first row read", () => {
    const cursor = { direction: "forward" as const, after: keyOf(rows[0]!) };
    const page = keysetPage(rows, { cursor, total: 8, keyOf, rowAfter: after, hasPrevious: true });
    expect(decodeCursor(page.previous_page!)).toEqual({ direction: "backward", after: keyOf(rows[0]!) });
  });

  it("stands one row past the page to look back at it", () => {
    const page = keysetPage(rows, { cursor: FIRST_PAGE, total: 8, keyOf, rowAfter: after, hasPrevious: false });
    expect(decodeCursor(page.current_page_backwards!)).toEqual({ direction: "backward", after });
  });

  it("carries the total, which is what the list header counts", () => {
    expect(keysetPage(rows, { cursor: FIRST_PAGE, total: 8, keyOf, rowAfter: after, hasPrevious: false }).total).toBe(8);
  });
});
