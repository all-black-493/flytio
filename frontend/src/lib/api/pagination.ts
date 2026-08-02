/**
 * The two pieces of wiring every cursor-paginated infinite query needs,
 * so the paging protocol lives in one place instead of being restated
 * (and drifting) at each call site:
 *
 *   queryFn: ({ pageParam }) => listBookings({ size: 10, cursor: pageParam }),
 *   initialPageParam: FIRST_PAGE,
 *   getNextPageParam: nextCursor,
 *
 * See cursorPageSchema in schemas.ts for the page shape these read.
 */

/** No cursor yet — the backend reads an absent cursor as "start at the
 * first page". */
export const FIRST_PAGE = null;

/** TanStack Query treats `undefined` (never null) as "there is no next
 * page" and stops fetching, so the page's null next_page is converted
 * rather than passed straight through. */
export function nextCursor(lastPage: { next_page?: string | null }): string | undefined {
  return lastPage.next_page ?? undefined;
}
