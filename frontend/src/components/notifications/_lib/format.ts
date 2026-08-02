import { formatDistanceToNow } from "date-fns";

/** "2026-08-01T01:58:44Z" -> "1 minute ago" - date-fns is already in the
 * dependency tree (pulled in transitively by @base-ui/react and
 * @duffel/components), so this reuses it rather than hand-rolling unit
 * selection (seconds/minutes/hours/...) on top of Intl.RelativeTimeFormat. */
export function formatRelativeTime(isoDateTime: string): string {
  return formatDistanceToNow(new Date(isoDateTime), { addSuffix: true });
}
