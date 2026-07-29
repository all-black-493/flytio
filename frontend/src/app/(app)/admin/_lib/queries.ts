/**
 * Shared query definitions for the staff/admin surface - same
 * queryOptions()/infiniteQueryOptions() pattern as
 * app/(app)/account/_lib/queries.ts and app/(app)/search/_lib/queries.ts.
 */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getAdminDashboardSummary,
  getAdminPopularRoutes,
  listAdminBookings,
  listAdminUsers,
} from "@/lib/api/client";

const ADMIN_PAGE_SIZE = 20;

export function adminDashboardSummaryQuery() {
  return queryOptions({
    queryKey: ["admin", "dashboard", "summary"] as const,
    queryFn: getAdminDashboardSummary,
  });
}

export function adminPopularRoutesQuery() {
  return queryOptions({
    queryKey: ["admin", "dashboard", "popular-routes"] as const,
    queryFn: () => getAdminPopularRoutes(),
  });
}

export function adminBookingsQuery(search?: string) {
  return infiniteQueryOptions({
    queryKey: ["admin", "bookings", search] as const,
    queryFn: ({ pageParam }) =>
      listAdminBookings({ search, limit: ADMIN_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_more ? lastPage.meta.offset + lastPage.meta.limit : undefined,
  });
}

export function adminUsersQuery(search?: string) {
  return infiniteQueryOptions({
    queryKey: ["admin", "users", search] as const,
    queryFn: ({ pageParam }) =>
      listAdminUsers({ search, limit: ADMIN_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_more ? lastPage.meta.offset + lastPage.meta.limit : undefined,
  });
}
