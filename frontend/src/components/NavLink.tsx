"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

/** Command-rail nav item for TopNav. Speaks the Control Tower HUD voice —
 * uppercase monospace with wide tracking — and marks the active sector with a
 * signal-orange underscore sitting on the header's bottom border, so the nav
 * reads like a lit tab on an instrument panel.
 *
 * In-page anchors (e.g. "/#board") never register as active: only real routes
 * light up. Meant to live inside a full-height (`items-stretch`) row so the
 * marker lands flush with the header edge. */
export function NavLink({ href, children, className }: NavLinkProps) {
  const pathname = usePathname();
  const base = href.split("#")[0];
  const isAnchorOnly = base === "" || base === "/";
  const active =
    !isAnchorOnly && (pathname === base || pathname.startsWith(`${base}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center font-mono text-[11px] uppercase tracking-[0.2em] transition-colors",
        active ? "text-board-ink" : "text-board-muted hover:text-board-ink",
        className,
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-signal transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}
