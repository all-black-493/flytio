"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  TicketX,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { formatRelativeTime } from "@/components/notifications/_lib/format";
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
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/client";
import type { NotificationRead, NotificationType } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

// Refreshes the "x ago" strings while the panel is open - a purely
// display-layer tick (no refetch), since date-fns computes the string
// fresh from `created_at` on every render.
const RELATIVE_TIME_TICK_MS = 30_000;

const NOTIFICATION_TYPE_ICON: Record<NotificationType, LucideIcon> = {
  booking_confirmed: CheckCircle2,
  booking_failed: XCircle,
  airline_change: AlertTriangle,
  cancellation_confirmed: Ban,
  change_confirmed: RefreshCw,
  support_request: MessageCircle,
  discount_redemption_failed: TicketX,
};

const NOTIFICATION_TYPE_ICON_CLASS: Record<NotificationType, string> = {
  booking_confirmed: "text-emerald-600 dark:text-emerald-400",
  booking_failed: "text-destructive",
  airline_change: "text-amber-600 dark:text-amber-400",
  cancellation_confirmed: "text-muted-foreground",
  change_confirmed: "text-signal",
  support_request: "text-sky-600 dark:text-sky-400",
  discount_redemption_failed: "text-destructive",
};

function NotificationRow({ notification }: { notification: NotificationRead }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: unreadNotificationCountQuery().queryKey });
    queryClient.invalidateQueries({ queryKey: notificationsPanelQuery().queryKey });
  };
  const readMutation = useMutation({
    mutationFn: () => markNotificationRead(notification.id),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteNotification(notification.id),
    onSuccess: invalidate,
  });

  const handleActivate = () => {
    if (!notification.read_at) readMutation.mutate();
  };

  const Icon = NOTIFICATION_TYPE_ICON[notification.type];
  const icon = (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
      <Icon className={cn("size-3.5", NOTIFICATION_TYPE_ICON_CLASS[notification.type])} />
    </span>
  );

  const body = (
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {!notification.read_at && (
          <span className="size-1.5 shrink-0 rounded-full bg-signal" />
        )}
        <span className="truncate">{notification.title}</span>
      </p>
      {notification.body && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
      )}
      <p className="font-mono text-[10px] text-muted-foreground">
        {formatRelativeTime(notification.created_at)}
      </p>
    </div>
  );

  return (
    <div
      className={cn(
        "flex items-start gap-1 rounded-lg transition-colors hover:bg-muted",
        !notification.read_at && "bg-signal/5",
      )}
    >
      {notification.link_url ? (
        <Link
          href={notification.link_url}
          onClick={handleActivate}
          className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2"
        >
          {icon}
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleActivate}
          className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left"
        >
          {icon}
          {body}
        </button>
      )}
      {/* Always visible (not hover-only) - a hover-revealed delete button
       * would be unreachable on touch/mobile, which has no hover state. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Delete notification"
        disabled={deleteMutation.isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteMutation.mutate();
        }}
        className="mt-1 mr-1 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="size-3" />
      </Button>
    </div>
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

  // Forces NotificationRow's "x ago" strings to recompute periodically
  // while the panel is visible - no data changes, just a render tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(id);
  }, [open]);

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unreadNotificationCountQuery().queryKey });
      queryClient.invalidateQueries({ queryKey: notificationsPanelQuery().queryKey });
    },
  });

  if (!authed) return null;

  const unreadCount = unread?.unread_count ?? 0;
  const notifications = panelQuery.data?.items ?? [];

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
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-80 p-0">
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
