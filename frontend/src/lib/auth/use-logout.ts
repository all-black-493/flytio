"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { logoutUser } from "@/lib/api/client";

/**
 * Shared by every "Log out" button. `router.refresh()` is required, not
 * cosmetic — layouts (AppSidebar's parent) don't re-render on client-side
 * navigation, so without it the sidebar would keep showing stale auth state
 * until a hard reload. `queryClient.clear()` is equally required but for
 * CLIENT state: router.refresh() only re-runs Server Components (that's
 * why TopNav correctly flips to "sign in") - any Client Component reading
 * cached query data (e.g. ConciergeWidget's `meQuery()`) would otherwise
 * keep showing the logged-out-in-the-cookie-but-not-in-the-cache user
 * indefinitely, since nothing else invalidates it.
 */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      queryClient.clear();
      router.push("/");
      router.refresh();
    },
    onError: () => toast.error("Couldn't log out — please try again."),
  });
}
