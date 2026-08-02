/**
 * Query definitions for the bell icon - same queryOptions() pattern as
 * every other _lib/queries.ts in this app. Lives alongside the
 * NotificationBell component (not under a specific app/ route) since
 * it's mounted in TopNav for both customer and staff/admin accounts.
 */

import { queryOptions } from "@tanstack/react-query";

import { getUnreadNotificationCount, listNotifications } from "@/lib/api/client";

const NOTIFICATION_PANEL_SIZE = 20;

// Periodic poll as a fallback only - the SSE stream (NotificationBell's
// useNotificationStream) is what actually keeps this live; this interval
// just covers the stream being down/reconnecting.
const UNREAD_COUNT_POLL_MS = 60_000;

export function unreadNotificationCountQuery() {
  return queryOptions({
    queryKey: ["notifications", "unread-count"] as const,
    queryFn: getUnreadNotificationCount,
    refetchInterval: UNREAD_COUNT_POLL_MS,
  });
}

export function notificationsPanelQuery() {
  return queryOptions({
    queryKey: ["notifications", "panel"] as const,
    queryFn: () => listNotifications({ size: NOTIFICATION_PANEL_SIZE }),
  });
}
