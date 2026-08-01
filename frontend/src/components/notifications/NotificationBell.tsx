"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import {
  notificationsPanelQuery,
  unreadNotificationCountQuery,
} from "@/components/notifications/_lib/queries";
import { useNotificationStream } from "@/components/notifications/use-notification-stream";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api/client";
import type { NotificationRead } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

function NotificationRow({ notification }: { notification: NotificationRead }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => markNotificationRead(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unreadNotificationCountQuery().queryKey });
      queryClient.invalidateQueries({ queryKey: notificationsPanelQuery().queryKey });
    },
  });

  const content = (
    <div
      className={`rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted ${
        notification.read_at ? "" : "bg-signal/5"
      }`}
      onClick={() => {
        if (!notification.read_at) mutation.mutate();
      }}
    >
      <div className="flex items-start gap-2">
        {!notification.read_at && (
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">{notification.title}</p>
          {notification.body && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
          )}
          <p className="font-mono text-[10px] text-muted-foreground">
            {new Date(notification.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );

  return notification.link_url ? (
    <Link href={notification.link_url} className="block">
      {content}
    </Link>
  ) : (
    <button type="button" className="block w-full" onClick={() => mutation.mutate()}>
      {content}
    </button>
  );
}

/** Bell icon mounted in TopNav (and MobileNavMenu) for both a regular
 * customer and a staff/admin account - identical component either way,
 * since which events a given user receives is decided server-side
 * (backend/crud/notifications.py), not by anything client-side. Renders
 * nothing when logged out. `triggerClassName` lets each mount point
 * supply colors that fit its own surface - TopNav's dark "board" bar
 * needs different tokens than the light Sheet MobileNavMenu renders it
 * inside. */
export function NotificationBell({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useQuery(meQuery());
  const authed = !!me;

  useNotificationStream(authed);

  const { data: unread } = useQuery({ ...unreadNotificationCountQuery(), enabled: authed });
  const panelQuery = useQuery({ ...notificationsPanelQuery(), enabled: authed && open });
  const queryClient = useQueryClient();

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unreadNotificationCountQuery().queryKey });
      queryClient.invalidateQueries({ queryKey: notificationsPanelQuery().queryKey });
    },
  });

  if (!authed) return null;

  const unreadCount = unread?.unread_count ?? 0;
  const notifications = panelQuery.data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        className={cn(
          "relative text-muted-foreground hover:text-foreground",
          triggerClassName,
        )}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full bg-signal font-mono text-[9px] text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            NOTIFICATIONS
          </span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto p-1.5">
          {panelQuery.isPending && (
            <div className="space-y-1.5 p-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          )}
          {panelQuery.isError && (
            <p className="p-3 text-center text-sm text-destructive">
              Couldn&apos;t load notifications.
            </p>
          )}
          {!panelQuery.isPending && notifications.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nothing here yet.
            </p>
          )}
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
