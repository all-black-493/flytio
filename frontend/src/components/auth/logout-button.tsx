"use client";

import { useLogout } from "@/lib/auth/use-logout";
import { cn } from "@/lib/utils";

export function LogoutButton({ className }: { className?: string }) {
  const logout = useLogout();

  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className={cn(
        "font-mono text-[11px] tracking-[0.15em] text-board-muted hover:text-board-ink disabled:opacity-50",
        className,
      )}
    >
      {logout.isPending ? "logging out…" : "log out"}
    </button>
  );
}
