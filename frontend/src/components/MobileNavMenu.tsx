"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StatusTicker } from "@/components/StatusTicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const NAV_LINKS = [
  { label: "Search", href: "/search" },
  { label: "Departures", href: "/#board" },
  { label: "Business", href: "/#business" },
  { label: "API", href: "/#business" },
];

const linkClass =
  "rounded-lg px-3 py-3 font-mono text-sm tracking-wide hover:bg-muted";

export function MobileNavMenu({ authed, staff = false }: { authed: boolean; staff?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="text-board-ink hover:bg-board-ink/10 hover:text-board-ink md:hidden"
      >
        <Menu />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-xs">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          <StatusTicker className="px-4" />

          <nav className="flex flex-col gap-1 px-4">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} href={link.href} onClick={close} className={linkClass}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3 border-t px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
                THEME
              </span>
              <ThemeToggle />
            </div>
            {authed && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
                  NOTIFICATIONS
                </span>
                <NotificationBell />
              </div>
            )}
            {authed ? (
              <div className="flex flex-col gap-1">
                {staff && (
                  <Link href="/admin" onClick={close} className={`${linkClass} text-center`}>
                    Admin
                  </Link>
                )}
                <Link href="/account" onClick={close} className={`${linkClass} text-center`}>
                  Account
                </Link>
                <LogoutButton className={`${linkClass} text-center`} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login" onClick={close} className={`${linkClass} text-center`}>
                  Sign in
                </Link>
                <Button
                  render={<Link href="/register" onClick={close} />}
                  nativeButton={false}
                  className="bg-signal font-semibold text-white hover:bg-signal/90"
                >
                  Create account
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
