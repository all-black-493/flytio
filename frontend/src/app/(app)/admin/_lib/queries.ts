/**
 * Shared query definitions for the staff/admin surface - same
 * queryOptions()/infiniteQueryOptions() pattern as
 * app/(app)/account/_lib/queries.ts and app/(app)/search/_lib/queries.ts.
 */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import type { RefundStatus } from "@/lib/api/schemas";

import {
  getAdminBookingDetail,
  getAdminDashboardSummary,
  getAdminPopularRoutes,
  getAdminUserBookings,
  getAdminUserDetail,
  listAdminBookings,
  listAdminDiscountCodes,
  listAdminGroups,
  listAdminPermissions,
  listAdminPricingSales,
  listAdminRefunds,
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

export function adminBookingDetailQuery(bookingId: string) {
  return queryOptions({
    queryKey: ["admin", "bookings", "detail", bookingId] as const,
    queryFn: () => getAdminBookingDetail(bookingId),
  });
}

export function adminUserDetailQuery(userId: string) {
  return queryOptions({
    queryKey: ["admin", "users", "detail", userId] as const,
    queryFn: () => getAdminUserDetail(userId),
  });
}

export function adminUserBookingsQuery(userId: string) {
  return infiniteQueryOptions({
    queryKey: ["admin", "users", "detail", userId, "bookings"] as const,
    queryFn: ({ pageParam }) =>
      getAdminUserBookings(userId, { limit: ADMIN_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.meta.has_more ? lastPage.meta.offset + lastPage.meta.limit : undefined,
  });
}

export function adminGroupsQuery() {
  return queryOptions({
    queryKey: ["admin", "groups"] as const,
    queryFn: listAdminGroups,
  });
}

export function adminPermissionsQuery() {
  return queryOptions({
    queryKey: ["admin", "permissions"] as const,
    queryFn: listAdminPermissions,
  });
}

export function adminPricingSalesQuery() {
  return queryOptions({
    queryKey: ["admin", "pricing", "sales"] as const,
    queryFn: listAdminPricingSales,
  });
}

export function adminDiscountCodesQuery() {
  return queryOptions({
    queryKey: ["admin", "pricing", "discount-codes"] as const,
    queryFn: listAdminDiscountCodes,
  });
}

/** `status` is part of the key so each filter caches separately; the
 * mutations invalidate the whole ["admin","refunds"] prefix, since an
 * action can move a refund from one filter into another. */
export function adminRefundsQuery(status: RefundStatus | "all") {
  return queryOptions({
    queryKey: ["admin", "refunds", status] as const,
    queryFn: () => listAdminRefunds(status === "all" ? {} : { status }),
  });
}
