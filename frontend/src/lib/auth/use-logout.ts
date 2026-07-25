"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { logoutUser } from "@/lib/api/client";

/**
 * Shared by every "Log out" button. `router.refresh()` is required, not
 * cosmetic — layouts (AppSidebar's parent) don't re-render on client-side
 * navigation, so without it the sidebar would keep showing stale auth state
 * until a hard reload.
 */
export function useLogout() {
  const router = useRouter();
  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      router.push("/");
      router.refresh();
    },
    onError: () => toast.error("Couldn't log out — please try again."),
  });
}
