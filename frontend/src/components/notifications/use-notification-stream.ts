"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  notificationsPanelQuery,
  unreadNotificationCountQuery,
} from "@/components/notifications/_lib/queries";
import { API_URL } from "@/lib/api/client";

/** Subscribes to GET /notifications/stream (SSE) while `enabled`, and
 * invalidates the unread-count/panel queries whenever a new notification
 * arrives. The stream itself carries the full notification payload (see
 * backend/crud/notifications.py's _notification_event), but invalidating
 * and refetching is simpler than reconciling a raw SSE push into React
 * Query's cache by hand, and pushes are rare enough (a handful per
 * session) that the extra round trip doesn't matter.
 *
 * Cookie-based auth only (`withCredentials: true`) - EventSource can't
 * send a custom Authorization header, which is exactly why the backend
 * endpoint accepts either the cookie or a bearer token (see
 * backend/utils/security.py's get_token) rather than requiring one.
 */
export function useNotificationStream(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`${API_URL}/notifications/stream`, {
      withCredentials: true,
    });
    source.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: unreadNotificationCountQuery().queryKey });
      queryClient.invalidateQueries({ queryKey: notificationsPanelQuery().queryKey });
    };
    return () => source.close();
  }, [enabled, queryClient]);
}
