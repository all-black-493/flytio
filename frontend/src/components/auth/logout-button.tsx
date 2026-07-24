"use client";

import { LogOut } from "lucide-react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useLogout } from "@/lib/auth/use-logout";

export function LogoutButton() {
  const logout = useLogout();

  return (
    <SidebarMenuButton
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      tooltip="Log out"
    >
      <LogOut />
      <span>{logout.isPending ? "Logging out…" : "Log out"}</span>
    </SidebarMenuButton>
  );
}
